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
  type NativeTouchEvent,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
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

type Preview = {
  uri: string;
  type: 'image' | 'video';
  width?: number;
  height?: number;
};

type CaptureMode = 'photo' | 'video';

/**
 * Plays the preview video and — mirroring what expo-image's onLoad does for photos —
 * fires onDimensions with the actual pixel dimensions as soon as the video track is
 * loaded by the player.  The caller validates orientation before trusting the values,
 * guarding against iOS reporting raw (un-rotated) sensor dimensions.
 */
function PreviewVideo({
  uri,
  onDimensions,
}: {
  uri: string;
  onDimensions?: (w: number, h: number) => void;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });

  useEventListener(player, 'videoTrackChange', ({ videoTrack }) => {
    const size = videoTrack?.size;
    if (size && size.width > 0 && size.height > 0) {
      onDimensions?.(size.width, size.height);
    }
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

/** Translate CameraView zoom (0–1) to a human-readable label. */
function zoomLabel(z: number): string {
  const x = 1 + z * 9;
  return x < 10 ? `${x.toFixed(1)}×` : `${Math.round(x)}×`;
}

export default function CameraScreen() {
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [zoomVisible, setZoomVisible] = useState(false);
  const [mode, setMode] = useState<CaptureMode>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [caption, setCaption] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [uploading, setUploading] = useState(false);
  const { prependPost } = useFeedStore();

  const zoomHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use a ref to read zoom synchronously inside PanResponder (closure can't read state)
  const zoomRef = useRef(0);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const pinchRef = useRef<{ dist: number; baseZoom: number } | null>(null);

  const getPinchDist = (touches: NativeTouchEvent[]) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // PanResponder lives entirely outside RNGH's touch-interception system, so it
  // never blocks buttons. It only claims the responder when ≥2 fingers are detected.
  const pinchResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length >= 2,
      onPanResponderGrant: (e) => {
        const { touches } = e.nativeEvent;
        if (touches.length >= 2) {
          pinchRef.current = { dist: getPinchDist(touches), baseZoom: zoomRef.current };
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
      onPanResponderRelease: () => { pinchRef.current = null; },
      onPanResponderTerminate: () => { pinchRef.current = null; },
    })
  ).current;

  const previewStageStyle = useMemo(() => {
    const horizontalPad = SPACING.base * 2;
    const stageW = Math.min(winW - horizontalPad, 720);
    const ar =
      preview &&
      preview.width != null &&
      preview.height != null &&
      preview.width > 0 &&
      preview.height > 0
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

  useEffect(() => {
    void requestPermission();
  }, [requestPermission]);

  // Flipping the camera reinitializes the hardware — must wait for onCameraReady again.
  // Mode changes (photo ↔ video) do NOT reinitialize hardware; onCameraReady won't re-fire,
  // so we must NOT reset cameraReady on mode changes or the shutter stays disabled forever.
  useEffect(() => {
    setCameraReady(false);
    setZoom(0);
  }, [facing]);

  /** Gallery picks sometimes omit width/height — measure file so preview frame matches the photo */
  useEffect(() => {
    if (!preview || preview.type !== 'image') return;
    if (preview.width != null && preview.height != null && preview.width > 0 && preview.height > 0) {
      return;
    }
    let cancelled = false;
    RNImage.getSize(
      preview.uri,
      (w, h) => {
        if (cancelled || w <= 0 || h <= 0) return;
        setPreview((p) => (p && p.uri === preview.uri ? { ...p, width: w, height: h } : p));
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [preview?.uri, preview?.type]);

  const showZoomLabel = (z: number) => {
    setZoom(z);
    setZoomVisible(true);
    if (zoomHideTimer.current) clearTimeout(zoomHideTimer.current);
    zoomHideTimer.current = setTimeout(() => setZoomVisible(false), 1500);
  };


  const takePicture = async () => {
    if (!cameraRef.current || !cameraReady) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo) {
        let { uri, width, height } = photo;
        // Front camera photos are saved mirrored on iOS (matching the mirrored preview).
        // Flip horizontally so the final image matches how others see the subject.
        if (facing === 'front') {
          const unmirrored = await ImageManipulator.manipulateAsync(
            uri,
            [{ flip: ImageManipulator.FlipType.Horizontal }],
            { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
          );
          uri = unmirrored.uri;
          width = unmirrored.width;
          height = unmirrored.height;
        }
        setPreview({ uri, type: 'image', width, height });
      }
    } catch (e: unknown) {
      Alert.alert("Couldn't capture photo", String((e as Error)?.message ?? e));
    }
  };

  const startRecording = async () => {
    if (!cameraRef.current || !cameraReady) return;
    if (isRecording) return;

    // Snapshot orientation *before* recording begins (user may rotate mid-recording;
    // we want the orientation they framed the shot with, not where they ended up).
    const screen = Dimensions.get('window');
    const captureInPortrait = screen.height > screen.width;

    setIsRecording(true);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: POST.MAX_DURATION_SEC });
      if (video) {
        const v = video as { uri: string; width?: number; height?: number };
        let w = v.width;
        let h = v.height;

        // expo-camera's recordAsync rarely returns width/height on iOS (the type only
        // guarantees `uri`). When it does return raw sensor dims they're landscape even
        // for a portrait recording — swap them if needed.
        if (w && h && w > h && captureInPortrait) {
          [w, h] = [h, w];
        }

        // If recordAsync gave us no dims at all (the common iOS case), infer the
        // aspect from the orientation we snapshotted above.  This is the value that
        // gets stored as media_width/media_height in the DB and drives the feed tile.
        if (!w || !h) {
          w = captureInPortrait ? 9 : 16;
          h = captureInPortrait ? 16 : 9;
        }

        setPreview({ uri: v.uri, type: 'video', width: w, height: h });
      }
    } catch (e: unknown) {
      Alert.alert("Couldn't record video", String((e as Error)?.message ?? e));
    } finally {
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    try {
      cameraRef.current?.stopRecording();
    } catch {
      // no-op
    }
  };

  const onShutterPress = () => {
    if (mode === 'photo') {
      void takePicture();
    } else if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.85,
      videoMaxDuration: POST.MAX_DURATION_SEC,
      mediaTypes: ['images', 'videos'],
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPreview({
        uri: asset.uri,
        type: asset.type === 'video' ? 'video' : 'image',
        width: asset.width ?? undefined,
        height: asset.height ?? undefined,
      });
    }
  };

  const handlePost = async () => {
    if (!preview) return;
    setUploading(true);
    try {
      const form = new FormData();
      if (preview.type === 'image') {
        const manipulated = await ImageManipulator.manipulateAsync(
          preview.uri,
          [{ resize: { width: 1600 } }],
          { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG },
        );
        form.append('media', {
          uri: manipulated.uri,
          type: 'image/jpeg',
          name: 'moment.jpg',
        } as unknown as Blob);
        form.append('media_type', 'image');
        form.append('client_media_width', String(manipulated.width));
        form.append('client_media_height', String(manipulated.height));
      } else {
        form.append('media', {
          uri: preview.uri,
          type: 'video/mp4',
          name: 'moment.mp4',
        } as unknown as Blob);
        form.append('media_type', 'video');
        if (preview.width != null && preview.height != null) {
          form.append('client_media_width', String(preview.width));
          form.append('client_media_height', String(preview.height));
        }
      }
      if (caption.trim()) form.append('caption', caption.trim());
      const { data } = await postsApi.create(form);
      prependPost(data.data);
      router.replace('/(tabs)/feed');
    } catch (e: unknown) {
      Alert.alert('Upload failed', formatApiError(e));
    } finally {
      setUploading(false);
    }
  };

  // ── Permission gate ──────────────────────────────────────────────────────────
  if (!permission?.granted) {
    return (
      <View style={styles.permContainer}>
        <Text style={styles.permText}>Camera access is needed to capture moments.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Preview / post flow ──────────────────────────────────────────────────────
  if (preview) {
    return (
      <KeyboardAvoidingView
        style={[styles.flex, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.previewScroll, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.previewToolbar}>
            <TouchableOpacity onPress={() => setPreview(null)} hitSlop={12}>
              <Text style={styles.discardBtn}>Discard</Text>
            </TouchableOpacity>
            <Text style={styles.previewTitle}>New moment</Text>
            <View style={{ width: 72 }} />
          </View>

          <View style={previewStageStyle}>
            {preview.type === 'image' ? (
              <Image
                source={{ uri: preview.uri }}
                style={styles.previewMedia}
                contentFit="contain"
                transition={300}
              />
            ) : (
              <PreviewVideo
                uri={preview.uri}
                onDimensions={(measuredW, measuredH) => {
                  // Mirror expo-image's onLoad: use the exact pixel dimensions the
                  // player reports, then correct the orientation so the stored
                  // dimensions match what the preview frame is showing.
                  const measuredPortrait = measuredH > measuredW;
                  const previewPortrait = (preview?.height ?? 16) > (preview?.width ?? 9);

                  // If orientation doesn't match, swap (measured dims are likely the
                  // raw sensor dims; we want display-correct dims that match
                  // the preview stage).
                  const finalW = measuredPortrait === previewPortrait ? measuredW : measuredH;
                  const finalH = measuredPortrait === previewPortrait ? measuredH : measuredW;

                  setPreview((p) => {
                    if (!p) return p;
                    if (p.width === finalW && p.height === finalH) return p;
                    return { ...p, width: finalW, height: finalH };
                  });
                }}
              />
            )}
          </View>

          <Text style={styles.previewHint}>{preview.type === 'image' ? 'Photo' : 'Video'}</Text>

          <TextInput
            style={styles.captionInput}
            placeholder="Add a caption..."
            placeholderTextColor={COLORS.textTertiary}
            value={caption}
            onChangeText={setCaption}
            maxLength={300}
            multiline
          />

          <TouchableOpacity
            style={[styles.postBtn, uploading && styles.postBtnDisabled]}
            onPress={handlePost}
            disabled={uploading}
            activeOpacity={0.9}
          >
            {uploading ? (
              <ActivityIndicator color={COLORS.textInverse} />
            ) : (
              <Text style={styles.postBtnText}>Post moment</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Camera view ──────────────────────────────────────────────────────────────
  return (
    // panHandlers are on the root view so two-finger pinch is always detected.
    // Single-finger taps are NOT claimed by PanResponder (onStartShouldSetPanResponder
    // returns false for < 2 fingers), so every button fires normally.
    <View style={styles.flex} {...pinchResponder.panHandlers}>
      {/* Full-screen viewfinder */}
      <CameraView
        key={facing}
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing={facing}
        zoom={zoom}
        mode={mode === 'video' ? 'video' : 'picture'}
        onCameraReady={() => setCameraReady(true)}
      />

      {/* Close button */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={14}>
          <Ionicons name="close" size={30} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Transient zoom label */}
      {zoomVisible && (
        <View style={styles.zoomLabelWrap} pointerEvents="none">
          <View style={styles.zoomLabelBubble}>
            <Text style={styles.zoomLabelText}>{zoomLabel(zoom)}</Text>
          </View>
        </View>
      )}

      {/* Bottom controls — gradient scrim + mode tabs + shutter row */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.72)', '#000']}
        style={[styles.bottomPanel, { paddingBottom: insets.bottom + 12 }]}
      >
        {/* Mode selector */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            onPress={() => setMode('video')}
            disabled={isRecording}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Video mode"
          >
            <Text style={[styles.modeText, mode === 'video' && styles.modeTextActive]}>
              VIDEO
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMode('photo')}
            disabled={isRecording}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Photo mode"
          >
            <Text style={[styles.modeText, mode === 'photo' && styles.modeTextActive]}>
              PHOTO
            </Text>
          </TouchableOpacity>
        </View>

        {/* Shutter row: gallery | shutter | flip */}
        <View style={styles.shutterRow}>
          {/* Gallery */}
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={pickFromGallery}
            disabled={isRecording}
            hitSlop={8}
            accessibilityLabel="Open gallery"
          >
            <Ionicons
              name="image-outline"
              size={28}
              color={isRecording ? 'rgba(255,255,255,0.3)' : '#fff'}
            />
          </TouchableOpacity>

          {/* Shutter */}
          <TouchableOpacity
            style={[
              styles.shutterBtn,
              isRecording && styles.shutterBtnRecording,
              !cameraReady && styles.shutterBtnDisabled,
            ]}
            onPress={onShutterPress}
            disabled={!cameraReady}
            activeOpacity={0.8}
            accessibilityLabel={isRecording ? 'Stop recording' : mode === 'photo' ? 'Take photo' : 'Start recording'}
          >
            <View style={[styles.shutterInner, isRecording && styles.shutterInnerRecording]} />
          </TouchableOpacity>

          {/* Flip */}
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
            disabled={isRecording}
            hitSlop={8}
            accessibilityLabel="Flip camera"
          >
            <Ionicons
              name="camera-reverse-outline"
              size={28}
              color={isRecording ? 'rgba(255,255,255,0.3)' : '#fff'}
            />
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },

  // Top
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.base,
    zIndex: 10,
  },

  // Zoom label
  zoomLabelWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  zoomLabelBubble: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  zoomLabelText: {
    color: '#fff',
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
  },

  // Bottom panel
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 40,
    zIndex: 10,
  },

  // Mode selector
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  modeText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    letterSpacing: 1.6,
  },
  modeTextActive: {
    color: '#fff',
    fontSize: FONTS.sizes.sm,
  },

  // Shutter row
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl * 1.5,
    marginBottom: SPACING.md,
  },
  sideBtn: {
    width: 52,
    height: 52,
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
  shutterBtnRecording: { borderColor: COLORS.error },
  shutterBtnDisabled: { opacity: 0.4 },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
  shutterInnerRecording: {
    borderRadius: 10,
    backgroundColor: COLORS.error,
    width: 34,
    height: 34,
  },

  // Permissions
  permContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  permText: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
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
  discardBtn: {
    color: COLORS.error,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
  },
  previewTitle: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
  },
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
  postBtnText: {
    color: COLORS.textInverse,
    fontWeight: FONTS.weights.bold,
    fontSize: FONTS.sizes.md,
  },
});
