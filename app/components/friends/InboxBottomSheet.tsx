// ============================================================
// InboxBottomSheet — Modal + bottom sheet (RN Animated).
// `onClose` runs after exit animation completes (backdrop, X, drag, back).
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '@/constants';

type Props = {
  open: boolean;
  /** Fires after the sheet has finished animating closed. */
  onClose: () => void;
  title: string;
  heightPercent: number;
  children: React.ReactNode;
  accessibilityLabel?: string;
};

const { height: WINDOW_H } = Dimensions.get('window');

export function InboxBottomSheet({
  open,
  onClose,
  title,
  heightPercent,
  children,
  accessibilityLabel,
}: Props) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const exitingRef = useRef(false);

  const panelH = Math.min(WINDOW_H * heightPercent, WINDOW_H - insets.top - 24);

  const translateY = useRef(new Animated.Value(panelH)).current;
  const backdropOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => {
      if (alive) setReduceMotion(!!v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const runEnter = useCallback(() => {
    translateY.setValue(panelH);
    backdropOp.setValue(0);
    const spring = reduceMotion
      ? Animated.timing(translateY, { toValue: 0, duration: 1, useNativeDriver: true })
      : Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 88,
          friction: 9,
          velocity: 0,
        });
    Animated.parallel([
      spring,
      Animated.timing(backdropOp, {
        toValue: 0.58,
        duration: reduceMotion ? 1 : 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOp, panelH, reduceMotion, translateY]);

  const runExit = useCallback(
    (after?: () => void) => {
      if (exitingRef.current) return;
      exitingRef.current = true;
      const d = reduceMotion ? 1 : 280;
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: panelH,
          duration: d,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOp, {
          toValue: 0,
          duration: d,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        exitingRef.current = false;
        setVisible(false);
        after?.();
      });
    },
    [backdropOp, panelH, reduceMotion, translateY],
  );

  useEffect(() => {
    if (open) {
      exitingRef.current = false;
      setVisible(true);
      requestAnimationFrame(() => runEnter());
    }
  }, [open, runEnter]);

  /** Programmatic close: parent sets `open` false while the sheet is still visible. */
  useEffect(() => {
    if (!open && visible) {
      runExit();
    }
  }, [open, visible, runExit]);

  const finishDismiss = useCallback(() => {
    runExit(onClose);
  }, [onClose, runExit]);

  useEffect(() => {
    if (!open || !visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finishDismiss();
      return true;
    });
    return () => sub.remove();
  }, [open, visible, finishDismiss]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && g.dy > 0,
        onPanResponderMove: (_, g) => {
          const dy = Math.max(0, g.dy);
          translateY.setValue(dy);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 90 || g.vy > 0.85) {
            finishDismiss();
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              tension: 100,
              friction: 10,
            }).start();
          }
        },
      }),
    [finishDismiss, translateY],
  );

  if (!visible) return null;

  const sheetStyle: ViewStyle = {
    transform: [{ translateY }],
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={finishDismiss}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <View style={styles.root} accessibilityLabel={accessibilityLabel ?? title}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={finishDismiss}
        >
          <Animated.View style={[styles.backdrop, { opacity: backdropOp }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.sheet,
            {
              height: panelH,
              paddingBottom: insets.bottom,
              ...sheetStyle,
            },
          ]}
        >
          <View {...panResponder.panHandlers} style={styles.handleZone}>
            <View style={styles.handleBar} />
          </View>

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable
              onPress={finishDismiss}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close sheet"
            >
              <Ionicons name="close" size={26} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.sheetBody}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sheet: {
    backgroundColor: COLORS.bgSheet,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 28 },
      default: {},
    }),
  },
  handleZone: {
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'center',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sheetTitle: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.bold,
  },
  sheetBody: {
    flex: 1,
    minHeight: 0,
  },
});
