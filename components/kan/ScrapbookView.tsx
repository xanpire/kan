import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyRow, SectionLabel } from '@/components/List';
import { colors, fonts, radius, spacing, type } from '@/constants/theme';
import { formatClock, formatDayMonth } from '@/lib/rpg/calendar';
import { useStoredImage } from '@/lib/rpg/imageStore';
import { scrapbook, type ScrapbookPhoto } from '@/lib/rpg/scrapbook';
import { loadThumbnail, useNearScreen } from '@/lib/rpg/thumbnails';
import type { AppDatabase } from '@/lib/rpg/types';

const COLUMNS = 3;
const GAP = 6;

function photoMeta(photo: ScrapbookPhoto) {
  return [`${formatDayMonth(photo.date)}, year ${photo.date.year}`, `you were ${photo.age}`, photo.place].filter(Boolean).join(' · ');
}

/**
 * One photo: drawn only once it nears the screen, as a small thumbnail
 * (audit 11c). Where a thumbnail can't be drawn, the full image is shown.
 */
function Thumb({ photo, size, onOpen }: { photo: ScrapbookPhoto; size: number; onOpen: () => void }) {
  const ref = useRef<View>(null);
  const near = useNearScreen(ref);
  // undefined: not drawn yet; null: no thumbnail here.
  const [thumb, setThumb] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!near) return;
    let live = true;
    void loadThumbnail(photo.image).then((value) => {
      if (live) setThumb(value);
    });
    return () => {
      live = false;
    };
  }, [near, photo.image]);

  const full = useStoredImage(near && thumb === null ? photo.image : null);
  const uri = thumb ?? full;

  return (
    <Pressable
      ref={ref}
      accessibilityLabel={`${photo.caption} ${photoMeta(photo)}`}
      accessibilityRole="imagebutton"
      onPress={onOpen}
      style={({ pressed }) => [styles.thumb, { width: size, height: size }, pressed && styles.pressed]}
    >
      {uri ? (
        <Image resizeMode="cover" source={{ uri }} style={StyleSheet.absoluteFill} />
      ) : near ? (
        <ActivityIndicator color={colors.textDim} size="small" />
      ) : null}
    </Pressable>
  );
}

function Viewer({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: ScrapbookPhoto[];
  index: number | null;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const photo = index === null ? null : photos[index];
  const uri = useStoredImage(photo?.image ?? null);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={photo !== null}>
      <View style={[styles.viewer, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.viewerTop}>
          <Text style={styles.viewerCount}>{index !== null ? `${index + 1} of ${photos.length}` : ''}</Text>
          <Pressable accessibilityLabel="Close" accessibilityRole="button" hitSlop={10} onPress={onClose}>
            <X color={colors.text} size={22} strokeWidth={2} />
          </Pressable>
        </View>
        <View style={styles.viewerImageWrap}>
          {uri ? (
            <Image resizeMode="contain" source={{ uri }} style={styles.viewerImage} />
          ) : (
            <ActivityIndicator color={colors.textDim} size="small" />
          )}
        </View>
        {photo ? (
          <View style={styles.viewerText}>
            <Text style={styles.viewerCaption}>{photo.caption}</Text>
            <Text style={styles.viewerMeta}>
              {formatClock(photo.date)} · {photoMeta(photo)}
            </Text>
          </View>
        ) : null}
        <View style={styles.viewerNav}>
          <Pressable
            accessibilityLabel="Earlier photo"
            accessibilityRole="button"
            disabled={index === null || index <= 0}
            onPress={() => index !== null && onIndex(index - 1)}
            style={({ pressed }) => [styles.navButton, (index === null || index <= 0) && styles.disabled, pressed && styles.pressed]}
          >
            <ChevronLeft color={colors.text} size={20} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityLabel="Later photo"
            accessibilityRole="button"
            disabled={index === null || index >= photos.length - 1}
            onPress={() => index !== null && onIndex(index + 1)}
            style={({ pressed }) => [
              styles.navButton,
              (index === null || index >= photos.length - 1) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <ChevronRight color={colors.text} size={20} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Journal → Scrapbook: your scene images by era and chapter. */
export function ScrapbookView({ db }: { db: AppDatabase }) {
  const { width } = useWindowDimensions();
  const eras = useMemo(() => scrapbook(db), [db]);
  const photos = useMemo(() => eras.flatMap((era) => era.chapters.flatMap((chapter) => chapter.photos)), [eras]);
  const [open, setOpen] = useState<number | null>(null);
  // The Kan screen is at most 680 wide with 20 padding each side.
  const inner = Math.min(width, 680) - spacing.xl * 2;
  const size = Math.floor((inner - GAP * (COLUMNS - 1)) / COLUMNS);

  if (photos.length === 0) {
    return (
      <>
        <SectionLabel>Scrapbook</SectionLabel>
        <EmptyRow
          body="Every scene image you make is kept here, by era and chapter, like photos of your life."
          title="No photos yet"
        />
      </>
    );
  }

  let offset = 0;

  return (
    <>
      {eras.map((era) => (
        <View key={era.era} style={styles.era}>
          <SectionLabel>{`${era.era} · ${era.count} ${era.count === 1 ? 'photo' : 'photos'}`}</SectionLabel>
          {era.chapters.map((chapter) => {
            const start = offset;
            offset += chapter.photos.length;

            return (
              <View key={`${era.era}-${chapter.chapter}`} style={styles.chapter}>
                <Text style={styles.chapterTitle}>
                  {chapter.memory ? `A memory: ${chapter.title}` : `Chapter ${chapter.chapter}`}
                  {!chapter.memory && chapter.title ? `: ${chapter.title}` : ''}
                </Text>
                <View style={styles.grid}>
                  {chapter.photos.map((photo, index) => (
                    <Thumb key={photo.logId} onOpen={() => setOpen(start + index)} photo={photo} size={size} />
                  ))}
                </View>
                {chapter.photos.length === 1 ? (
                  <Text numberOfLines={2} style={styles.single}>
                    {chapter.photos[0].caption}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
      <Viewer index={open} onClose={() => setOpen(null)} onIndex={setOpen} photos={photos} />
    </>
  );
}

const styles = StyleSheet.create({
  era: {
    gap: spacing.md,
  },
  chapter: {
    gap: spacing.sm,
  },
  chapterTitle: {
    ...type.rowMeta,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  thumb: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  single: {
    ...type.rowMeta,
    color: colors.textDim,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.3,
  },
  viewer: {
    flex: 1,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  viewerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewerCount: {
    ...type.rowMeta,
    color: colors.textMuted,
  },
  viewerImageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerText: {
    gap: spacing.xs,
    maxWidth: 680,
    alignSelf: 'center',
    width: '100%',
  },
  viewerCaption: {
    ...type.rowBody,
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 22,
  },
  viewerMeta: {
    ...type.rowMeta,
    color: colors.textDim,
  },
  viewerNav: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
});
