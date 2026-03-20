// ============================================================
// app/camera.tsx — Capture modal (camera + gallery picker)
// ============================================================
import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  Dimensions, TextInput, ActivityIndicator,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { postsApi } from '@/services/api';
import { useFeedStore } from '@/stores/feedStore';
import { COLORS, SPACING, FONTS, RADIUS, POST } from '@/constants';

const { width, height } = Dimensions.get('window');

export default function CameraScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [isRecording, setIsRecording] = useState(false);
  const [caption, setCaption] = useState('');
  const [preview, setPreview] = useState<{ uri: string; type: 'image' | 'video' } | null>(null);
  const [uploading, setUploading] = useState(false);
  const { prependPost } = useFeedStore();

  useEffect(() => { requestPermission(); }, []);

  const getImagePickerAllMediaTypes = () => {
    const picker: any = ImagePicker;
    // Different expo-image-picker versions expose either `MediaType` or
    // `MediaTypeOptions`. Your current build doesn't have `MediaType`.
    return picker?.MediaType?.All ?? picker?.MediaTypeOptions?.All ?? null;
  };

  const takePicture = async () => {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
    if (photo) setPreview({ uri: photo.uri, type: 'image' });
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
    const options: any = {
      quality: 0.8,
      videoMaxDuration: POST.MAX_DURATION_SEC,
    };
    if (All) options.mediaTypes = All;
    const result = await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPreview({ uri: asset.uri, type: asset.type === 'video' ? 'video' : 'image' });
    }
  };

  const handlePost = async () => {
    if (!preview) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('media', {
        uri: preview.uri,
        type: preview.type === 'video' ? 'video/mp4' : 'image/jpeg',
        name: preview.type === 'video' ? 'moment.mp4' : 'moment.jpg',
      } as any);
      form.append('media_type', preview.type);
      if (caption) form.append('caption', caption);

      const { data } = await postsApi.create(form);
      prependPost(data.data);
      // Ensure we reliably return to the feed (router.back() can land on a blank modal state).
      router.replace('/feed');
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
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

  // Preview screen
  if (preview) {
    return (
      <View style={styles.container}>
        <View style={styles.previewBg} />
        <View style={styles.previewActions}>
          <TouchableOpacity onPress={() => setPreview(null)}>
            <Text style={styles.discardBtn}>✕ Discard</Text>
          </TouchableOpacity>
        </View>
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
        >
          {uploading
            ? <ActivityIndicator color={COLORS.textInverse} />
            : <Text style={styles.postBtnText}>Post moment</Text>}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing} />

      {/* Overlay controls (CameraView should not receive children) */}
      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.closeBtn}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}>
            <Text style={styles.flipBtn}>⟳</Text>
          </TouchableOpacity>
        </View>

        {/* Hint */}
        <View style={styles.hintRow}>
          <Text style={styles.hint}>{POST.MAX_DURATION_SEC}s max video</Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.galleryBtn} onPress={pickFromGallery}>
            <Text style={styles.galleryBtnText}>📷</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shutterBtn, isRecording && styles.shutterRecording]}
            onPress={isRecording ? stopRecording : takePicture}
            onLongPress={startRecording}
            delayLongPress={200}
          >
            <View style={[styles.shutterInner, isRecording && styles.shutterInnerRecording]} />
          </TouchableOpacity>

          <View style={{ width: 52 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: SPACING.xl,
  },
  closeBtn: { color: '#fff', fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.bold },
  flipBtn: { color: '#fff', fontSize: FONTS.sizes.xl },
  hintRow: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hint: { color: 'rgba(255,255,255,0.4)', fontSize: FONTS.sizes.sm },
  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingBottom: 48,
  },
  galleryBtn: {
    width: 52, height: 52, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  galleryBtnText: { fontSize: 24 },
  shutterBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  shutterRecording: { borderColor: COLORS.error },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  shutterInnerRecording: { borderRadius: 6, backgroundColor: COLORS.error },
  // Permission
  permContainer: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  permText: { color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.lg },
  permBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  permBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold },
  // Preview
  previewBg: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.bgCard },
  previewActions: { paddingTop: 56, paddingHorizontal: SPACING.base },
  discardBtn: { color: COLORS.error, fontSize: FONTS.sizes.base },
  captionInput: {
    margin: SPACING.base, padding: SPACING.md,
    backgroundColor: COLORS.bgElevated, borderRadius: RADIUS.md,
    color: COLORS.textPrimary, fontSize: FONTS.sizes.base, minHeight: 80,
  },
  postBtn: {
    margin: SPACING.base, backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md, padding: SPACING.base, alignItems: 'center',
  },
  postBtnDisabled: { opacity: 0.5 },
  postBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.base },
});
