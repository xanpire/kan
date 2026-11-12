import { StyleSheet, Text, View } from 'react-native';

import { ListCard, ListRow, SectionLabel } from '@/components/List';
import { colors, fonts, spacing, type } from '@/constants/theme';
import { formatDayMonth } from '@/lib/rpg/calendar';
import {
  STANDING_LABEL,
  bingoListings,
  formatRyo,
  isAkatsukiMember,
  reputationOf,
  standingBand,
} from '@/lib/rpg/reputation';
import { renownOf } from '@/lib/rpg/renown';
import type { AppDatabase } from '@/lib/rpg/types';

const RANK_NOTE: Record<string, string> = {
  S: 'Most of their shinobi know your face',
  A: 'Their chunin and jonin would know you',
  B: 'Their jonin and hunter-nin may know you',
  C: 'Only hunter-nin would place you',
};

/**
 * What the world has on you: the bingo books you have seen yourself in, and
 * your standing inside the Akatsuki. Entries you have not seen stay hidden,
 * like news you have not heard.
 */
export function ReputationCard({ db, first = true }: { db: AppDatabase; first?: boolean }) {
  const listings = bingoListings(db);
  const known = listings.filter((listing) => listing.known);
  const member = isAkatsukiMember(db);
  const standing = reputationOf(db).akatsuki?.standing ?? 0;

  return (
    <>
      <SectionLabel first={first}>Your name out there</SectionLabel>
      <ListCard>
        {known.length === 0 ? (
          <ListRow
            body="As far as you know, no village has put a price on your head. A bounty poster or a hunter naming your price would tell you."
            title="No bingo book you know of"
          />
        ) : (
          known.map((listing) => (
            <ListRow
              key={listing.village}
              meta={`${RANK_NOTE[listing.rank]}${listing.listedOn ? ` · listed ${formatDayMonth(listing.listedOn)}, Year ${listing.listedOn.year}` : ''}`}
              title={`${listing.name} · ${listing.rank}-rank`}
              trailing={<Text style={styles.rank}>{listing.rank}</Text>}
            >
              <Text style={styles.bounty}>
                {formatRyo(listing.bounty)}
                {renownOf(db).epithets[listing.village]?.known ? ` · “${renownOf(db).epithets[listing.village]!.name}”` : ''}
              </Text>
              {listing.lastReason ? <Text style={type.rowBody}>{listing.lastReason}</Text> : null}
            </ListRow>
          ))
        )}
        {member ? (
          <ListRow
            body={reputationOf(db).akatsuki?.lastReason ?? 'How Pain, Konan and your partners regard you.'}
            title="Akatsuki"
            trailing={<Text style={styles.standing}>{STANDING_LABEL[standingBand(standing)]}</Text>}
          >
            <View style={styles.track}>
              <View style={styles.mid} />
              <View
                style={[
                  styles.fill,
                  standing >= 0
                    ? { left: '50%', width: `${Math.min(100, standing) / 2}%` }
                    : { right: '50%', width: `${Math.min(100, -standing) / 2}%`, backgroundColor: colors.textDim },
                ]}
              />
            </View>
          </ListRow>
        ) : null}
      </ListCard>
    </>
  );
}

const styles = StyleSheet.create({
  rank: {
    minWidth: 28,
    textAlign: 'center',
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.accentText,
  },
  bounty: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textSoft,
    marginTop: 2,
  },
  standing: {
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.accentText,
  },
  track: {
    height: 4,
    marginTop: spacing.sm,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  mid: {
    position: 'absolute',
    left: '50%',
    width: 1,
    height: 4,
    backgroundColor: colors.borderStrong,
  },
  fill: {
    position: 'absolute',
    height: 4,
    backgroundColor: colors.accent,
  },
});
