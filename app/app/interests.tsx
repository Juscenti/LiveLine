import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { interestsApi, usersApi } from '@/services/api';
import type { Interest } from '@/types';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';

export default function InterestsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Interest[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    interestsApi
      .getAll()
      .then((res) => setItems(res.data.data ?? res.data))
      .catch((e: any) => {
        Alert.alert('Failed to load interests', e?.message ?? 'Unknown error');
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCount = useMemo(() => selected.size, [selected]);

  const save = async () => {
    setSaving(true);
    try {
      await usersApi.updateInterests(Array.from(selected));
      Alert.alert('Saved', 'Your interests were updated.');
      router.replace('/profile');
    } catch (e: any) {
      Alert.alert('Save failed', e?.response?.data?.error ?? e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/profile')}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Interests</Text>
        <View style={{ width: 48 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      ) : (
        <>
          <Text style={styles.subtitle}>
            Pick what fits your vibe. Selected: {selectedCount}
          </Text>

          <View style={styles.grid}>
            {items.map((it) => {
              const isOn = selected.has(it.id);
              return (
                <TouchableOpacity
                  key={it.id}
                  onPress={() => toggle(it.id)}
                  style={[styles.chip, isOn && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, isOn && styles.chipTextSelected]}>
                    {it.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={save}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save interests'}</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.base, paddingBottom: SPACING.xl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 56,
    marginBottom: SPACING.lg,
  },
  backText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  title: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.lg },
  subtitle: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, marginBottom: SPACING.md },

  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },

  chip: {
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.bgElevated,
  },
  chipSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentMuted,
  },
  chipText: { color: COLORS.textPrimary, fontWeight: FONTS.weights.medium, fontSize: FONTS.sizes.sm },
  chipTextSelected: { color: COLORS.textInverse },

  saveBtn: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold },
});

