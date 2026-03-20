// app/(tabs)/capture.tsx
// This screen exists so the center tab button can resolve the `capture` route.
// It immediately forwards into the `/camera` modal.
import { useEffect } from 'react';
import { router } from 'expo-router';

export default function CaptureTab() {
  useEffect(() => {
    // Navigate to the full-screen camera flow.
    router.replace('/camera');
  }, []);

  return null;
}

