// ============================================================
// app/camera.tsx — Capture modal (camera + gallery + preview)
// ============================================================
import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { postsApi } from '@/services/api';
import { useFeedStore } from '@/stores/feedStore';
import { formatApiError } from '@/utils/apiErrors';
import { COLORS, SPACING, FONTS, RADIUS, POST } from '@/constants';

const { width: SCREEN_W } = Dimensions.get('window');

type Preview = {
  uri: string;
  type: 'image' | 'video';
  width?: number;
  height?: number;
};

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [isRecording, setIsRecording] = useState(false);
  const [caption, setCaption] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [uploading, setUploading] = useState(false);
  const { prependPost } = useFeedStore();

  useEffect(() => {
    void requestPermission();
  }, [requestPermission]);

  const getImagePickerAllMediaTypes = () => {
    const picker = ImagePicker as typeof ImagePicker & {
      MediaType?: { All: string };
      MediaTypeOptions?: { All: string };
    };
    return picker?.MediaType?.All ?? picker?.MediaTypeOptions?.All ?? null;
  };

  const takePicture = async () => {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85 });
    if (photo) {
      setPreview({
        uri: photo.uri,
        type: 'image',
        width: photo.width,
        height: photo.height,
      });
    }
  };

  const startRecording = async () => {
    setIsRecording(true);
    const video = await cameraRef.current?.recordAsync({ maxDuration: POST.MAX_DURATION_SEC });
    if (video) setPreview({ uri: video.uri, type: 'video' });
    setIsRecording(false);
  };

  const stopRecording = () => {
    cameraRef.current?.stopRecording();
  };

  const pickFromGallery = async () => {
    const All = getImagePickerAllMediaTypes();
    const options: ImagePicker.ImagePickerOptions = {
      quality: 0.85,
      videoMaxDuration: POST.MAX_DURATION_SEC,
    };
    if (All) (options as { mediaTypes?: unknown }).mediaTypes = All;
    const result = await ImagePicker.launchImageLibraryAsync(options);
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

          <View style={styles.previewStage}>
            {preview.type === 'image' ? (
              <Image
                source={{ uri: preview.uri }}
                style={styles.previewMedia}
                contentFit="contain"
                transition={300}
              />
            ) : (
              <Video
                source={{ uri: preview.uri }}
                style={styles.previewMedia}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                isLooping
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

  return (
    <View style={styles.flex}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing} />

      <View style={styles.overlay}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.closeBtn}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}>
            <Text style={styles.flipBtn}>Flip</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.hintRow}>
          <Text style={styles.hint}>{POST.MAX_DURATION_SEC}s max video · tap shutter · hold for video</Text>
        </View>

        <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
          <TouchableOpacity style={styles.galleryBtn} onPress={pickFromGallery}>
            <Text style={styles.galleryBtnText}>Library</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shutterBtn, isRecording && styles.shutterRecording]}
            onPress={isRecording ? stopRecording : takePicture}
            onLongPress={startRecording}
            delayLongPress={200}
          >
            <View style={[styles.shutterInner, isRecording && styles.shutterInnerRecording]} />
          </TouchableOpacity>

          <View style={{ width: 72 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
  },
  closeBtn: { color: '#fff', fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.bold },
  flipBtn: { color: COLORS.accent, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  hintRow: { alignItems: 'center' },
  hint: { color: 'rgba(255,255,255,0.45)', fontSize: FONTS.sizes.xs, textAlign: 'center', paddingHorizontal: SPACING.sm },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
  },
  galleryBtn: {
    width: 72,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryBtnText: { color: '#fff', fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  shutterBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterRecording: { borderColor: COLORS.error },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  shutterInnerRecording: { borderRadius: 8, backgroundColor: COLORS.error },
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
  previewStage: {
    width: SCREEN_W - SPACING.base * 2,
    alignSelf: 'center',
    aspectRatio: 3 / 4,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: '#111',
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
  postBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.md },
});
