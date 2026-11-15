import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ListCard, ListRow, SectionLabel } from '@/components/List';
import { colors, fonts, spacing, type } from '@/constants/theme';
import { formatDayMonth, monthName } from '@/lib/rpg/calendar';
import {
  LEAF_FILE,
  STANDING_LABEL,
  bingoListings,
  formatRyo,
  isAkatsukiMember,
  reputationOf,
  standingBand,
} from '@/lib/rpg/reputation';
import { AUDIENCE_NAME, carriedBooks, knownEpithets, leafThinksDead, listingSubject, listingTitle, renownOf } from '@/lib/rpg/renown';
import type { AppDatabase, CarriedBingoBook } from '@/lib/rpg/types';

const RANK_NOTE: Record<string, string> = {
  S: 'Most of their shinobi know your face',
  A: 'Their chunin and jonin would know you',
  B: 'Their jonin and hunter-nin may know you',
  C: 'Only hunter-nin would place you',
};

/** Their entry has a description, not your face. */
const UNLINKED_NOTE = 'They don’t know it’s you';

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A bingo book you carry: tap to read your page, exactly as printed. */
function BookRow({ book }: { book: CarriedBingoBook }) {
  const [open, setOpen] = useState(false);

  return (
    <ListRow
      accessibilityState={book.page ? { expanded: open } : undefined}
      meta={`Printed ${monthName(book.edition.month)}, Year ${book.edition.year}${book.page ? (open ? '' : ' · tap to read your page') : ''}`}
      onPress={book.page ? () => setOpen((value) => !value) : undefined}
      title={capitalise(book.item)}
    >
      {open && book.page ? (
        <View style={styles.page}>
          {book.page.split('\n').map((line, index) => (
            <Text key={index} style={index === 0 ? styles.pageHead : index === 1 ? styles.pageTitle : styles.pageLine}>
              {line}
            </Text>
          ))}
        </View>
      ) : !book.page ? (
        <Text style={type.rowBody}>There is no page on you in it.</Text>
      ) : null}
    </ListRow>
  );
}

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
  const books = carriedBooks(db);
  const names = knownEpithets(db);
  const heard = renownOf(db).heard ?? [];
  // You know the Leaf's file once you have learned what it says.
  const leafFile = leafThinksDead(db) && (db.state.canonProgress?.completed ?? []).includes('kan-bingo-book');

  return (
    <>
      <SectionLabel first={first}>Your name out there</SectionLabel>
      <ListCard>
        {leafFile ? (
          <ListRow body="Its file on you reads the same as the day you left. To the Leaf, you died that night." meta="Hidden Leaf" title={`“${LEAF_FILE}”`} />
        ) : null}
        {known.length === 0 && !leafFile ? (
          <ListRow
            body="As far as you know, no village has put a price on your head. A bounty poster or a hunter naming your price would tell you."
            title="No bingo book you know of"
          />
        ) : (
          known.map((listing) => {
            const linked = listingSubject(db, listing.village).linked;

            return (
              <ListRow
                key={listing.village}
                meta={`${linked ? RANK_NOTE[listing.rank] : UNLINKED_NOTE}${listing.listedOn ? ` · listed ${formatDayMonth(listing.listedOn)}, Year ${listing.listedOn.year}` : ''}`}
                title={`${listing.name} · ${listing.rank}-rank`}
                trailing={<Text style={styles.rank}>{listing.rank}</Text>}
              >
                <Text style={styles.bounty}>
                  {formatRyo(listing.bounty)} · {listingTitle(db, listing.village)}
                </Text>
                {listing.lastReason ? <Text style={type.rowBody}>{listing.lastReason}</Text> : null}
              </ListRow>
            );
          })
        )}
        {books.map((book) => (
          <BookRow book={book} key={book.id} />
        ))}
        {names.map(({ audience, epithet }) => (
          <ListRow key={audience} meta={`What they call you · ${capitalise(AUDIENCE_NAME[audience])}`} title={`“${capitalise(epithet.name)}”`} />
        ))}
        {heard.map((item) => (
          <ListRow key={item.name} meta="A name you’ve heard yourself called" title={`“${capitalise(item.name)}”`} />
        ))}
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
    color: colors.accentTint,
  },
  bounty: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textSoft,
    marginTop: 2,
  },
  page: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 4,
  },
  pageHead: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.textDim,
  },
  pageTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 15,
    color: colors.accentTint,
  },
  pageLine: {
    ...type.rowBody,
  },
  standing: {
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.accentTint,
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
