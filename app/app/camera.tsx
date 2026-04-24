// ============================================================
// app/camera.tsx — Capture modal (camera + gallery + preview)
// ============================================================
import { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Dimensions,
  useWindowDimensions,
  Image as RNImage,
  Modal,
  FlatList,
  Animated,
  type NativeTouchEvent,
} from 'react-native';
import { useSharedValue, useAnimatedStyle, withSpring, Animated as RNAnimated } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEventListener } from 'expo';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { postsApi } from '@/services/api';
import { useFeedStore } from '@/stores/feedStore';
import { formatApiError } from '@/utils/apiErrors';
import { COLORS, SPACING, FONTS, RADIUS, POST } from '@/constants';

type Preview = { uri: string; type: 'image' | 'video'; width?: number; height?: number };
type CaptureMode = 'photo' | 'video';
type FlashMode = 'auto' | 'on' | 'off';

function PreviewVideo({
  uri,
  onDimensions,
}: {
  uri: string;
  onDimensions?: (w: number, h: number) => void;
}) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.play(); });
  useEventListener(player, 'videoTrackChange', ({ videoTrack }) => {
    const size = videoTrack?.size;
    if (size && size.width > 0 && size.height > 0) onDimensions?.(size.width, size.height);
  });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%' }}
      contentFit="contain"
      nativeControls
    />
  );
}

function zoomLabel(z: number): string {
  const x = 1 + z * 9;
  return x < 10 ? `${x.toFixed(1)}×` : `${Math.round(x)}×`;
}

function FlashToggle({ mode }: { mode: FlashMode }) {
  if (mode === 'on') return <Ionicons name="flash" size={20} color={COLORS.warning} />;
  if (mode === 'off') {
    return (
      <View style={{ opacity: 0.45 }}>
        <Ionicons name="flash-outline" size={20} color="#fff" />
      </View>
    );
  }
  return (
    <View>
      <Ionicons name="flash-outline" size={20} color="#fff" />
      <Text style={st.flashA}>A</Text>
    </View>
  );
}

type ZoomPillProps = { label: string; z: number; active: boolean; zoomVisible: boolean; currentZoom: number; onPress: (z: number) => void };
function ZoomPill({ label, z, active, zoomVisible, currentZoom, onPress }: ZoomPillProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handlePress = () => {
    scale.value = withSpring(0.82, { damping: 6, stiffness: 300 }, () => {
      scale.value = withSpring(1, { damping: 8, stiffness: 250 });
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(z);
  };
  return (
    <RNAnimated.View style={animStyle}>
      <TouchableOpacity style={[st.zoomPill, active && st.zoomPillActive]} onPress={handlePress} activeOpacity={1}>
        <Text style={[st.zoomPillText, active && st.zoomPillTextActive]}>
          {active && zoomVisible ? zoomLabel(currentZoom) : label}
        </Text>
      </TouchableOpacity>
    </RNAnimated.View>
  );
}

export default function CameraScreen() {
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [zoomVisible, setZoomVisible] = useState(false);
  const [mode, setMode] = useState<CaptureMode>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [caption, setCaption] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [uploading, setUploading] = useState(false);

  // Camera controls
  const [flash, setFlash] = useState<FlashMode>('auto');
  const [timerDelay, setTimerDelay] = useState<0 | 3 | 10>(0);
  const [timerCountdown, setTimerCountdown] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [lastCapturedUri, setLastCapturedUri] = useState<string | null>(null);
  const [shotCount, setShotCount] = useState(0);
  const [postTarget, setPostTarget] = useState<'post' | 'story'>('post');
  const [bottomPanelH, setBottomPanelH] = useState(200);
  const [sliderWidth, setSliderWidth] = useState(0);
  const [sliderVisible, setSliderVisible] = useState(false);
  const [viewportMode, setViewportMode] = useState<'regular' | 'vertical'>('regular');
  const [cameraKey, setCameraKey] = useState(0);
  const [recordProgress, setRecordProgress] = useState(0);

  // Gallery
  const [showGallery, setShowGallery] = useState(false);
  const [galleryAssets, setGalleryAssets] = useState<MediaLibrary.Asset[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);

  const focusAnim = useRef(new Animated.Value(0)).current;
  const captureFlashAnim = useRef(new Animated.Value(0)).current;
  const focusHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordProgressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdToRecordRef = useRef(false);
  const { prependPost } = useFeedStore();

  const [swipeLabel, setSwipeLabel] = useState<CaptureMode>('photo');
  const swipeIndicatorAnim = useRef(new Animated.Value(0)).current;

  // Refs for PanResponder closures
  const zoomHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sliderHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomRef = useRef(0);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const pinchRef = useRef<{ dist: number; baseZoom: number } | null>(null);
  const modeRef = useRef<CaptureMode>('photo');
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const isRecordingRef = useRef(false);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => {
    if (isRecording) {
      const start = Date.now();
      recordProgressInterval.current = setInterval(() => {
        setRecordProgress(Math.min((Date.now() - start) / 1000 / POST.MAX_DURATION_SEC, 1));
      }, 50);
    } else {
      if (recordProgressInterval.current) clearInterval(recordProgressInterval.current);
      setRecordProgress(0);
    }
    return () => { if (recordProgressInterval.current) clearInterval(recordProgressInterval.current); };
  }, [isRecording]);
  const viewportModeRef = useRef<'regular' | 'vertical'>('regular');
  useEffect(() => { viewportModeRef.current = viewportMode; }, [viewportMode]);
  const sliderTrackWidth = useRef(0);

  const getPinchDist = (touches: NativeTouchEvent[]) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const showZoomLabel = (z: number) => {
    setZoom(z);
    setZoomVisible(true);
    if (zoomHideTimer.current) clearTimeout(zoomHideTimer.current);
    zoomHideTimer.current = setTimeout(() => setZoomVisible(false), 1500);
  };

  const showSlider = () => {
    setSliderVisible(true);
    if (sliderHideTimer.current) clearTimeout(sliderHideTimer.current);
    sliderHideTimer.current = setTimeout(() => setSliderVisible(false), 1500);
  };

  // Main viewfinder PanResponder — handles pinch-zoom + horizontal swipe for mode
  const pinchResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponder: (e, gs) => {
        if (e.nativeEvent.touches.length >= 2) return true;
        if (
          !isRecordingRef.current &&
          e.nativeEvent.touches.length === 1 &&
          Math.abs(gs.dx) > 20 &&
          Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5
        ) return true;
        return false;
      },
      onPanResponderGrant: (e) => {
        const { touches } = e.nativeEvent;
        if (touches.length >= 2) {
          pinchRef.current = { dist: getPinchDist(touches), baseZoom: zoomRef.current };
          showSlider();
        }
      },
      onPanResponderMove: (e) => {
        const { touches } = e.nativeEvent;
        if (!pinchRef.current || touches.length < 2) return;
        const newDist = getPinchDist(touches);
        if (pinchRef.current.dist <= 0) return;
        const ratio = newDist / pinchRef.current.dist;
        const next = Math.min(1, Math.max(0, pinchRef.current.baseZoom + (ratio - 1) * 0.5));
        showZoomLabel(next);
      },
      onPanResponderRelease: (e, gs) => {
        const wasPinch = pinchRef.current !== null;
        pinchRef.current = null;
        if (wasPinch) {
          showSlider();
        } else if (
          !isRecordingRef.current &&
          Math.abs(gs.dx) > 60 &&
          Math.abs(gs.dx) > Math.abs(gs.dy)
        ) {
          const newMode = gs.dx < 0 ? 'photo' : 'video';
          setMode(newMode);
          setSwipeLabel(newMode);
          swipeIndicatorAnim.stopAnimation();
          swipeIndicatorAnim.setValue(0);
          Animated.sequence([
            Animated.timing(swipeIndicatorAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
            Animated.delay(600),
            Animated.timing(swipeIndicatorAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
          ]).start();
        }
      },
      onPanResponderTerminate: () => { pinchRef.current = null; },
    })
  ).current;

  // Zoom slider PanResponder — intercepts single-finger drags on the slider strip
  const sliderPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        if (sliderTrackWidth.current <= 0) return;
        const z = Math.max(0, Math.min(1, e.nativeEvent.locationX / sliderTrackWidth.current));
        showZoomLabel(z);
        showSlider();
      },
      onPanResponderMove: (e) => {
        if (sliderTrackWidth.current <= 0) return;
        const z = Math.max(0, Math.min(1, e.nativeEvent.locationX / sliderTrackWidth.current));
        showZoomLabel(z);
        showSlider();
      },
    })
  ).current;

  const previewStageStyle = useMemo(() => {
    const stageW = Math.min(winW - SPACING.base * 2, 720);
    const ar =
      preview?.width && preview?.height && preview.width > 0 && preview.height > 0
        ? Math.min(Math.max(preview.width / preview.height, 0.2), 6)
        : preview?.type === 'video' ? 9 / 16 : 3 / 4;
    return {
      width: stageW,
      alignSelf: 'center' as const,
      aspectRatio: ar,
      borderRadius: RADIUS.lg,
      overflow: 'hidden' as const,
      backgroundColor: '#111',
    };
  }, [preview, winW]);

  useEffect(() => { void requestPermission(); }, [requestPermission]);
  useEffect(() => { setCameraReady(false); setZoom(0); }, [facing]);

  useEffect(() => {
    if (!preview || preview.type !== 'image') return;
    if (preview.width && preview.height && preview.width > 0 && preview.height > 0) return;
    let cancelled = false;
    RNImage.getSize(
      preview.uri,
      (w, h) => {
        if (cancelled || w <= 0 || h <= 0) return;
        setPreview((p) => (p && p.uri === preview.uri ? { ...p, width: w, height: h } : p));
      },
      () => {},
    );
    return () => { cancelled = true; };
  }, [preview?.uri, preview?.type]);

  const cycleFlash = () => {
    if (mode === 'video') {
      setFlash(f => f === 'on' ? 'off' : 'on');
    } else {
      setFlash(f => f === 'auto' ? 'on' : f === 'on' ? 'off' : 'auto');
    }
  };

  useEffect(() => {
    if (mode === 'video' && flash === 'auto') setFlash('off');
  }, [mode]);

  const cancelTimer = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setTimerActive(false);
    setTimerCountdown(0);
  };

  const executeWithTimer = (action: () => void) => {
    if (timerDelay === 0) { action(); return; }
    let remaining = timerDelay;
    setTimerActive(true);
    setTimerCountdown(remaining);
    timerIntervalRef.current = setInterval(() => {
      remaining -= 1;
      setTimerCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(timerIntervalRef.current!);
        setTimerActive(false);
        action();
      }
    }, 1000);
  };

  const handleViewfinderTap = (e: { nativeEvent: { locationX: number; locationY: number } }) => {
    const { locationX, locationY } = e.nativeEvent;
    setFocusPoint({ x: locationX, y: locationY });
    focusAnim.stopAnimation();
    focusAnim.setValue(1);
    if (focusHideTimer.current) clearTimeout(focusHideTimer.current);
    focusHideTimer.current = setTimeout(() => {
      Animated.timing(focusAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(
        () => setFocusPoint(null),
      );
    }, 1500);
  };

  const takePicture = async () => {
    if (!cameraRef.current || !cameraReady) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(captureFlashAnim, { toValue: 1, duration: 40, useNativeDriver: true }),
      Animated.timing(captureFlashAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo) {
        let { uri, width, height } = photo;
        if (facing === 'front') {
          const r = await ImageManipulator.manipulateAsync(
            uri,
            [{ flip: ImageManipulator.FlipType.Horizontal }],
            { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
          );
          uri = r.uri; width = r.width; height = r.height;
        }
        setPreview({ uri, type: 'image', width, height });
        setLastCapturedUri(uri);
        setShotCount(c => c + 1);
      }
    } catch (e: unknown) {
      Alert.alert("Couldn't capture photo", String((e as Error)?.message ?? e));
    }
  };

  const startRecording = async () => {
    if (!cameraRef.current || !cameraReady || isRecording) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const screen = Dimensions.get('window');
    const captureInPortrait = screen.height > screen.width;
    setIsRecording(true);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: POST.MAX_DURATION_SEC });
      if (video) {
        const v = video as { uri: string; width?: number; height?: number };
        let w = v.width, h = v.height;
        if (w && h && w > h && captureInPortrait) [w, h] = [h, w];
        if (!w || !h) { w = captureInPortrait ? 9 : 16; h = captureInPortrait ? 16 : 9; }
        if (viewportModeRef.current === 'regular') {
          if (captureInPortrait) { h = Math.round((w ?? 9) * (4 / 3)); }
          else { w = Math.round((h ?? 9) * (4 / 3)); }
        }
        setPreview({ uri: v.uri, type: 'video', width: w, height: h });
        setLastCapturedUri(v.uri);
        setShotCount(c => c + 1);
      }
    } catch (e: unknown) {
      Alert.alert("Couldn't record video", String((e as Error)?.message ?? e));
    } finally {
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try { cameraRef.current?.stopRecording(); } catch { /* no-op */ }
  };

  const onShutterPress = () => {
    if (timerActive) { cancelTimer(); return; }
    if (mode === 'photo') {
      executeWithTimer(() => void takePicture());
    } else if (isRecording) {
      stopRecording();
    } else {
      executeWithTimer(() => void startRecording());
    }
  };

  const openInAppGallery = async () => {
    if (!mediaPermission?.granted) {
      const { granted } = await requestMediaPermission();
      if (!granted) {
        Alert.alert('Permission needed', 'Allow access to your media library to pick photos and videos.');
        return;
      }
    }
    setShowGallery(true);
    setGalleryLoading(true);
    try {
      const { assets } = await MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        first: 200,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      setGalleryAssets(assets);
    } catch {
      Alert.alert('Error', 'Could not load your media library.');
    } finally {
      setGalleryLoading(false);
    }
  };

  const selectGalleryAsset = (asset: MediaLibrary.Asset) => {
    let w: number | undefined = asset.width ?? undefined;
    let h: number | undefined = asset.height ?? undefined;
    if (viewportMode === 'regular' && asset.mediaType === MediaLibrary.MediaType.video && w && h) {
      const screen = Dimensions.get('window');
      const portrait = screen.height > screen.width;
      if (portrait) { h = Math.round(w * (4 / 3)); }
      else { w = Math.round(h * (4 / 3)); }
    }
    setPreview({
      uri: asset.uri,
      type: asset.mediaType === MediaLibrary.MediaType.video ? 'video' : 'image',
      width: w,
      height: h,
    });
    setShowGallery(false);
  };

  const handlePost = async () => {
    if (!preview) return;
    setUploading(true);
    try {
      const form = new FormData();
      if (preview.type === 'image') {
        const m = await ImageManipulator.manipulateAsync(
          preview.uri,
          [{ resize: { width: 1600 } }],
          { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG },
        );
        form.append('media', { uri: m.uri, type: 'image/jpeg', name: 'moment.jpg' } as unknown as Blob);
        form.append('media_type', 'image');
        form.append('client_media_width', String(m.width));
        form.append('client_media_height', String(m.height));
      } else {
        form.append('media', { uri: preview.uri, type: 'video/mp4', name: 'moment.mp4' } as unknown as Blob);
        form.append('media_type', 'video');
        if (preview.width != null && preview.height != null) {
          form.append('client_media_width', String(preview.width));
          form.append('client_media_height', String(preview.height));
        }
      }
      if (caption.trim()) form.append('caption', caption.trim());
      form.append('post_target', postTarget);
      const { data } = await postsApi.create(form);
      prependPost(data.data);
      router.replace('/(tabs)/feed');
    } catch (e: unknown) {
      Alert.alert('Upload failed', formatApiError(e));
    } finally {
      setUploading(false);
    }
  };

  // ── Permission gate ───────────────────────────────────────────────────────
  if (!permission?.granted) {
    return (
      <View style={st.permContainer}>
        <Text style={st.permText}>Camera access is needed to capture moments.</Text>
        <TouchableOpacity style={st.permBtn} onPress={requestPermission}>
          <Text style={st.permBtnText}>Grant access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Preview / post flow ───────────────────────────────────────────────────
  if (preview) {
    return (
      <KeyboardAvoidingView
        style={[st.flex, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={st.flex}
          contentContainerStyle={[st.previewScroll, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={st.previewToolbar}>
            <TouchableOpacity onPress={() => { setPreview(null); setCameraReady(false); setCameraKey(k => k + 1); }} hitSlop={12}>
              <Text style={st.discardBtn}>Discard</Text>
            </TouchableOpacity>
            <Text style={st.previewTitle}>New moment</Text>
            <View style={{ width: 72 }} />
          </View>

          <View style={previewStageStyle}>
            {preview.type === 'image' ? (
              <Image
                source={{ uri: preview.uri }}
                style={st.previewMedia}
                contentFit="contain"
                transition={300}
              />
            ) : (
              <PreviewVideo
                uri={preview.uri}
                onDimensions={(mW, mH) => {
                  const mPort = mH > mW;
                  const pPort = (preview?.height ?? 16) > (preview?.width ?? 9);
                  const fW = mPort === pPort ? mW : mH;
                  const fH = mPort === pPort ? mH : mW;
                  setPreview(p => {
                    if (!p || (p.width === fW && p.height === fH)) return p;
                    return { ...p, width: fW, height: fH };
                  });
                }}
              />
            )}
          </View>

          <Text style={st.previewHint}>{preview.type === 'image' ? 'Photo' : 'Video'}</Text>

          {/* POST / STORY selector */}
          <View style={st.previewPostStoryRow}>
            <TouchableOpacity
              onPress={() => setPostTarget('post')}
              style={[st.previewPostStoryPill, postTarget === 'post' && st.previewPostStoryPillActive]}
            >
              <Text style={[st.previewPostStoryText, postTarget === 'post' && st.previewPostStoryTextActive]}>POST</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPostTarget('story')}
              style={[st.previewPostStoryPill, postTarget === 'story' && st.previewPostStoryPillActive]}
            >
              <Text style={[st.previewPostStoryText, postTarget === 'story' && st.previewPostStoryTextActive]}>STORY</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={st.captionInput}
            placeholder="Add a caption..."
            placeholderTextColor={COLORS.textTertiary}
            value={caption}
            onChangeText={setCaption}
            maxLength={300}
            multiline
          />

          {/* Tag people */}
          <TouchableOpacity style={st.tagRow} activeOpacity={0.7}>
            <Ionicons name="pricetag-outline" size={18} color={COLORS.textSecondary} />
            <Text style={st.tagRowLabel}>Tag people</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textTertiary} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[st.postBtn, uploading && st.postBtnDisabled]}
            onPress={handlePost}
            disabled={uploading}
            activeOpacity={0.9}
          >
            {uploading ? (
              <ActivityIndicator color={COLORS.textInverse} />
            ) : (
              <Text style={st.postBtnText}>Post moment</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Camera view ───────────────────────────────────────────────────────────
  const thumbLeft = sliderWidth > 0 ? zoom * sliderWidth - 10 : 0;
  const ZOOM_STEPS = [{ label: '1×', z: 0 }, { label: '2×', z: 1 / 9 }, { label: '3×', z: 2 / 9 }];
  const nearestStep = ZOOM_STEPS.reduce((best, s) =>
    Math.abs(s.z - zoom) < Math.abs(best.z - zoom) ? s : best
  );

  // Shared top bar content (used in both modes)
  const pillToggleIcon = viewportMode === 'regular' ? 'expand-outline' : 'contract-outline';
  const topBarJSX = (isAbsolute: boolean) => (
    <View style={[isAbsolute ? st.topBar : st.topBarRegular, { paddingTop: insets.top + 20 }]}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={14}>
        <Ionicons name="close" size={28} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1 }} />
      {shotCount > 0 && (
        <View style={st.shotBadge} pointerEvents="none">
          <Text style={st.shotBadgeText}>{shotCount}</Text>
        </View>
      )}
      <View style={st.topBarPill}>
        <TouchableOpacity style={st.topIcon} hitSlop={10}>
          <Ionicons name="moon-outline" size={20} color="rgba(255,255,255,0.75)" />
        </TouchableOpacity>
        <TouchableOpacity style={st.topIcon} onPress={cycleFlash} hitSlop={10}>
          <FlashToggle mode={flash} />
        </TouchableOpacity>
        <TouchableOpacity style={st.topIcon} onPress={() => setShowGrid(g => !g)} hitSlop={10}>
          <Ionicons name="grid-outline" size={20} color={showGrid ? COLORS.accent : '#fff'} />
        </TouchableOpacity>
        <View style={st.pillDivider} />
        <TouchableOpacity
          style={st.topIcon}
          onPress={() => setViewportMode(m => m === 'regular' ? 'vertical' : 'regular')}
          hitSlop={10}
        >
          <Ionicons name={pillToggleIcon} size={18} color={viewportMode === 'vertical' ? COLORS.accent : 'rgba(255,255,255,0.75)'} />
        </TouchableOpacity>
      </View>
    </View>
  );

  // Shared shutter row content
  const shutterRowJSX = (
    <View style={st.shutterRow}>
      <TouchableOpacity
        style={st.galleryBtn}
        onPress={openInAppGallery}
        disabled={isRecording}
        hitSlop={8}
        accessibilityLabel="Open gallery"
      >
        {lastCapturedUri ? (
          <Image source={{ uri: lastCapturedUri }} style={st.galleryThumb} contentFit="cover" />
        ) : (
          <View style={st.galleryThumbEmpty}>
            <Ionicons name="image-outline" size={22} color={isRecording ? 'rgba(255,255,255,0.3)' : '#fff'} />
          </View>
        )}
      </TouchableOpacity>
      <View style={{ position: 'relative', width: 80, height: 80 }}>
        {isRecording && (
          <Svg width={88} height={88} style={{ position: 'absolute', top: -4, left: -4 }} pointerEvents="none">
            <Circle
              cx={44} cy={44} r={40}
              stroke={COLORS.error} strokeWidth={3} fill="none"
              strokeDasharray={`${2 * Math.PI * 40}`}
              strokeDashoffset={`${2 * Math.PI * 40 * (1 - recordProgress)}`}
              strokeLinecap="round"
              rotation="-90" origin="44, 44"
            />
          </Svg>
        )}
        <TouchableOpacity
          style={[st.shutterBtn, mode === 'video' && st.shutterBtnVideo, isRecording && st.shutterBtnRec, !cameraReady && st.shutterBtnOff]}
          onPress={onShutterPress}
          disabled={!cameraReady}
          activeOpacity={0.8}
          delayLongPress={300}
          onLongPress={() => {
            if (mode === 'video' && !isRecording) {
              holdToRecordRef.current = true;
              void startRecording();
            }
          }}
          onPressOut={() => {
            if (holdToRecordRef.current && isRecording) {
              holdToRecordRef.current = false;
              stopRecording();
            }
          }}
          accessibilityLabel={
            timerActive ? 'Cancel timer' :
            isRecording ? 'Stop recording' :
            mode === 'photo' ? 'Take photo' : 'Start recording'
          }
        >
          {timerActive ? (
            <Text style={st.shutterTimerText}>{timerCountdown}</Text>
          ) : (
            <View style={[st.shutterInner, mode === 'video' && !isRecording && st.shutterInnerVideo, isRecording && st.shutterInnerRec]} />
          )}
        </TouchableOpacity>
      </View>
      <View style={st.sideBtnGroup}>
        <TouchableOpacity
          style={st.sideBtn}
          onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
          disabled={isRecording}
          hitSlop={8}
          accessibilityLabel="Flip camera"
        >
          <Ionicons name="camera-reverse-outline" size={26} color={isRecording ? 'rgba(255,255,255,0.3)' : '#fff'} />
        </TouchableOpacity>
      </View>
    </View>
  );

  // Shared mode row content
  const modeRowJSX = (
    <View>
      <Animated.View style={[st.swipeIndicator, { opacity: swipeIndicatorAnim }]} pointerEvents="none">
        <Ionicons
          name={swipeLabel === 'photo' ? 'chevron-back-outline' : 'chevron-forward-outline'}
          size={13}
          color="rgba(255,255,255,0.6)"
        />
        <Text style={st.swipeIndicatorText}>{swipeLabel === 'video' ? 'VIDEO' : 'PHOTO'}</Text>
        <Ionicons
          name={swipeLabel === 'photo' ? 'chevron-back-outline' : 'chevron-forward-outline'}
          size={13}
          color="rgba(255,255,255,0.6)"
        />
      </Animated.View>
      <View style={st.modeRow}>
        <TouchableOpacity onPress={() => { void Haptics.selectionAsync(); setMode('video'); }} disabled={isRecording} hitSlop={12}>
          <Text style={[st.modeText, mode === 'video' && st.modeTextActive]}>VIDEO</Text>
        </TouchableOpacity>
        <View style={st.modeDot} />
        <TouchableOpacity onPress={() => { void Haptics.selectionAsync(); setMode('photo'); }} disabled={isRecording} hitSlop={12}>
          <Text style={[st.modeText, mode === 'photo' && st.modeTextActive]}>PHOTO</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={st.flex}>

      {/* ── REGULAR MODE ── */}
      {viewportMode === 'regular' && (
        <>
          {topBarJSX(false)}

          {/* Constrained 3:4 viewfinder + floating zoom pills */}
          <View style={{ position: 'relative' }}>
            <View style={st.regularViewfinder} {...pinchResponder.panHandlers}>
              <CameraView
                key={`${facing}-${cameraKey}`}
                ref={cameraRef}
                style={StyleSheet.absoluteFillObject}
                facing={facing}
                zoom={zoom}
                flash={flash}
                mode={mode === 'video' ? 'video' : 'picture'}
                enableTorch={mode === 'video' && flash === 'on'}
                onCameraReady={() => setCameraReady(true)}
              />
              {showGrid && (
                <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                  <View style={[st.gridLine, st.gridV, { left: '33.33%' }]} />
                  <View style={[st.gridLine, st.gridV, { left: '66.67%' }]} />
                  <View style={[st.gridLine, st.gridH, { top: '33.33%' }]} />
                  <View style={[st.gridLine, st.gridH, { top: '66.67%' }]} />
                </View>
              )}
              <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleViewfinderTap} />
              {focusPoint && (
                <Animated.View
                  pointerEvents="none"
                  style={[st.focusRing, { left: focusPoint.x - 28, top: focusPoint.y - 28, opacity: focusAnim }]}
                />
              )}
              {timerActive && timerCountdown > 0 && (
                <View style={st.timerOverlay} pointerEvents="none">
                  <Text style={st.timerCountText}>{timerCountdown}</Text>
                </View>
              )}
              {zoomVisible && (
                <View style={st.zoomBubbleWrap} pointerEvents="none">
                  <View style={st.zoomBubble}>
                    <Text style={st.zoomBubbleText}>{zoomLabel(zoom)}</Text>
                  </View>
                </View>
              )}
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: '#fff', opacity: captureFlashAnim, zIndex: 15 }]} />
            </View>

            {/* Zoom pills — float above the black controls border */}
            <View style={st.zoomPillRow}>
              {ZOOM_STEPS.map(s => (
                <ZoomPill
                  key={s.label}
                  label={s.label}
                  z={s.z}
                  active={s.z === nearestStep.z}
                  zoomVisible={zoomVisible}
                  currentZoom={zoom}
                  onPress={setZoom}
                />
              ))}
            </View>
          </View>

          {/* Controls below viewfinder */}
          <View style={[st.regularControls, { paddingBottom: insets.bottom + 16 }]}>
            {modeRowJSX}
            {shutterRowJSX}
          </View>
        </>
      )}

      {/* ── VERTICAL MODE ── */}
      {viewportMode === 'vertical' && (
        <View style={StyleSheet.absoluteFillObject} {...pinchResponder.panHandlers}>
          <CameraView
            key={`${facing}-${cameraKey}`}
            ref={cameraRef}
            style={StyleSheet.absoluteFillObject}
            facing={facing}
            zoom={zoom}
            flash={flash}
            mode={mode === 'video' ? 'video' : 'picture'}
            enableTorch={mode === 'video' && flash === 'on'}
            onCameraReady={() => setCameraReady(true)}
          />
          {showGrid && (
            <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
              <View style={[st.gridLine, st.gridV, { left: '33.33%' }]} />
              <View style={[st.gridLine, st.gridV, { left: '66.67%' }]} />
              <View style={[st.gridLine, st.gridH, { top: '33.33%' }]} />
              <View style={[st.gridLine, st.gridH, { top: '66.67%' }]} />
            </View>
          )}
          <TouchableOpacity
            style={[StyleSheet.absoluteFillObject, { top: insets.top + 140, bottom: bottomPanelH }]}
            activeOpacity={1}
            onPress={handleViewfinderTap}
          />
          {focusPoint && (
            <Animated.View
              pointerEvents="none"
              style={[st.focusRing, { left: focusPoint.x - 28, top: focusPoint.y - 28, opacity: focusAnim }]}
            />
          )}
          {timerActive && timerCountdown > 0 && (
            <View style={st.timerOverlay} pointerEvents="none">
              <Text style={st.timerCountText}>{timerCountdown}</Text>
            </View>
          )}
          {zoomVisible && (
            <View style={st.zoomBubbleWrap} pointerEvents="none">
              <View style={st.zoomBubble}>
                <Text style={st.zoomBubbleText}>{zoomLabel(zoom)}</Text>
              </View>
            </View>
          )}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: '#fff', opacity: captureFlashAnim, zIndex: 15 }]} />

          {topBarJSX(true)}

          {/* Zoom slider */}
          <View
            style={[st.sliderWrap, { bottom: bottomPanelH + 10 }, !sliderVisible && { opacity: 0 }]}
            pointerEvents={sliderVisible ? 'auto' : 'none'}
            {...sliderPanResponder.panHandlers}
          >
            <View
              style={st.sliderTrack}
              onLayout={e => {
                sliderTrackWidth.current = e.nativeEvent.layout.width;
                setSliderWidth(e.nativeEvent.layout.width);
              }}
            >
              <View style={st.sliderTrackBg} />
              <View style={[st.sliderFill, { width: `${zoom * 100}%` }]} />
              {sliderWidth > 0 && (
                <View style={[st.sliderThumb, { left: thumbLeft }]} />
              )}
            </View>
          </View>

          {/* Bottom panel */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.75)', '#000']}
            style={[st.bottomPanel, { paddingBottom: insets.bottom + 10 }]}
            onLayout={e => setBottomPanelH(e.nativeEvent.layout.height)}
          >
            {modeRowJSX}
            {shutterRowJSX}
          </LinearGradient>
        </View>
      )}

      {/* ── In-app gallery modal ── */}
      <Modal
        visible={showGallery}
        animationType="slide"
        onRequestClose={() => setShowGallery(false)}
      >
        <View style={[st.galleryModal, { paddingTop: insets.top }]}>
          <View style={st.galleryHeader}>
            <TouchableOpacity onPress={() => setShowGallery(false)} hitSlop={12}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={st.galleryTitle}>Choose media</Text>
            <Text style={st.gallerySubtitle}>Long videos are shown but locked</Text>
          </View>

          {galleryLoading ? (
            <View style={st.galleryLoader}>
              <ActivityIndicator size="large" color={COLORS.accent} />
            </View>
          ) : (
            <FlatList
              data={galleryAssets}
              numColumns={3}
              keyExtractor={a => a.id}
              contentContainerStyle={st.galleryGrid}
              renderItem={({ item }) => {
                const dur = item.duration;
                const mm = String(Math.floor(dur / 60)).padStart(1, '0');
                const ss = String(Math.floor(dur % 60)).padStart(2, '0');
                const tooLong = item.mediaType === MediaLibrary.MediaType.video && item.duration > POST.MAX_DURATION_SEC;
                return (
                  <TouchableOpacity
                    style={st.galleryItem}
                    onPress={() => !tooLong && selectGalleryAsset(item)}
                    disabled={tooLong}
                    activeOpacity={tooLong ? 1 : 0.75}
                  >
                    <Image source={{ uri: item.uri }} style={st.galleryItemImg} contentFit="cover" />
                    {tooLong && <View style={st.galleryTooLongOverlay} />}
                    {item.mediaType === MediaLibrary.MediaType.video && !tooLong && (
                      <View style={st.galleryVideoBadge}>
                        <Ionicons name="play" size={9} color="#fff" />
                        <Text style={st.galleryVideoDur}>{mm}:{ss}</Text>
                      </View>
                    )}
                    {tooLong && (
                      <View style={st.galleryTooLongBadge}>
                        <Ionicons name="lock-closed" size={10} color="#fff" />
                        <Text style={st.galleryTooLongText}>Too long</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={st.galleryEmpty}>
                  <Ionicons name="images-outline" size={48} color={COLORS.textTertiary} />
                  <Text style={st.galleryEmptyText}>No media found</Text>
                  <Text style={st.galleryEmptyNote}>Long videos are shown but can't be selected</Text>
                </View>
              }
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const ITEM_SIZE = Dimensions.get('window').width / 3 - 2;

const st = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },

  // Grid overlay
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.18)' },
  gridV: { width: 1, top: 0, bottom: 0 },
  gridH: { height: 1, left: 0, right: 0 },

  // Focus ring
  focusRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.warning,
  },

  // Timer countdown overlay
  timerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  timerCountText: {
    color: '#fff',
    fontSize: 96,
    fontWeight: FONTS.weights.black,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  // Zoom bubble
  zoomBubbleWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  zoomBubble: {
    backgroundColor: 'rgba(0,0,0,0.52)',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  zoomBubbleText: {
    color: '#fff',
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
  },

  // Top bar — vertical mode (absolute overlay)
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingBottom: 10,
    zIndex: 10,
  },
  // Top bar — regular mode (in normal flow)
  topBarRegular: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingBottom: 10,
    backgroundColor: '#000',
    zIndex: 10,
  },
  pillDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 2,
  },
  shotBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shotBadgeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.semibold,
    letterSpacing: 0.5,
  },
  topBarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
  },
  topIcon: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flashA: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    color: COLORS.warning,
    fontSize: 8,
    fontWeight: FONTS.weights.black,
  },

  // Regular mode viewfinder + controls
  regularViewfinder: {
    width: '100%',
    aspectRatio: 3 / 4,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  regularControls: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 16,
  },

  // Zoom pills (regular mode) — float above black controls border
  zoomPillRow: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    zIndex: 5,
  },
  zoomPill: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(50,50,50,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomPillActive: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  zoomPillText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    letterSpacing: 0.3,
  },
  zoomPillTextActive: {
    color: '#fff',
  },

  // Zoom slider
  sliderWrap: {
    position: 'absolute',
    left: SPACING.xl,
    right: SPACING.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 8,
    zIndex: 8,
  },
  sliderTrack: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  sliderTrackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    top: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 3,
  },

  // Bottom panel
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 52,
    zIndex: 10,
  },

  // Swipe mode indicator
  swipeIndicator: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  swipeIndicatorText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    letterSpacing: 1.6,
  },

  // Mode row
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  modeText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    letterSpacing: 1.6,
  },
  modeTextActive: { color: '#fff', fontSize: FONTS.sizes.sm },
  modeDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  // Shutter row
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xxxl,
    marginBottom: SPACING.sm,
  },
  galleryBtn: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  galleryThumb: { width: '100%', height: '100%' },
  galleryThumbEmpty: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterBtnRec: { borderColor: COLORS.error },
  shutterBtnVideo: { borderColor: COLORS.error },
  shutterBtnOff: { opacity: 0.4 },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
  shutterInnerVideo: { backgroundColor: COLORS.error },
  shutterInnerRec: {
    borderRadius: 8,
    backgroundColor: COLORS.error,
    width: 34,
    height: 34,
  },
  shutterTimerText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: FONTS.weights.black,
  },
  sideBtnGroup: {
    width: 52,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  sideBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Permissions
  permContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  permText: { color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.lg },
  permBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  permBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold },

  // Preview / post
  previewScroll: { flexGrow: 1, backgroundColor: COLORS.bg },
  previewToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.md,
  },
  discardBtn: { color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  previewTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: FONTS.weights.semibold },
  previewMedia: { width: '100%', height: '100%' },
  previewHint: {
    color: COLORS.textTertiary,
    fontSize: FONTS.sizes.xs,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  captionInput: {
    marginHorizontal: SPACING.base,
    marginTop: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: COLORS.bgElevated,
    borderRadius: RADIUS.md,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.base,
    minHeight: 88,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  postBtn: {
    marginHorizontal: SPACING.base,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  postBtnDisabled: { opacity: 0.55 },
  postBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.md },

  // In-app gallery modal
  galleryModal: { flex: 1, backgroundColor: '#000' },
  galleryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  galleryTitle: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
    marginLeft: SPACING.md,
  },
  gallerySubtitle: {
    color: COLORS.textTertiary,
    fontSize: FONTS.sizes.xs,
  },
  galleryLoader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  galleryGrid: { padding: 1 },
  galleryItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: 1,
  },
  galleryItemImg: { width: '100%', height: '100%' },
  galleryVideoBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  galleryVideoDur: { color: '#fff', fontSize: 10, fontWeight: FONTS.weights.semibold },
  galleryEmpty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: SPACING.sm,
  },
  galleryEmptyText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold },
  galleryEmptyNote: { color: COLORS.textTertiary, fontSize: FONTS.sizes.xs },

  // Gallery — too-long video overlay
  galleryTooLongOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  galleryTooLongBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  galleryTooLongText: { color: 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: FONTS.weights.semibold },

  // Preview page — POST/STORY selector
  previewPostStoryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: SPACING.md,
    marginHorizontal: SPACING.base,
  },
  previewPostStoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  previewPostStoryPillActive: {
    backgroundColor: COLORS.bgElevated,
    borderColor: COLORS.accent,
  },
  previewPostStoryText: {
    color: COLORS.textTertiary,
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    letterSpacing: 1.2,
  },
  previewPostStoryTextActive: { color: COLORS.accent },

  // Preview page — Tag people row
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.base,
    marginTop: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.bgElevated,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tagRowLabel: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.base,
  },
});
