// Reading the state model's reply: JSON parsing and snake_case → TurnDiff.

import { readRyo } from './money';
import { THREAD_TYPES } from './stateSchema';
import { MAX_SKIP_SECONDS } from './timeSkip';
import type {
  Audience,
  ConsequenceKind,
  FactType,
  LetterCarrierKind,
  LocationKind,
  NameHow,
  NamePart,
  ReputationFaction,
  SafehouseDiff,
  SafehouseKind,
  TurnDiff,
  VillageFaction,
} from './types';
import { SCENE_CAST_LIMIT } from './sceneLimits';

const CARRIERS = ['bird', 'ninken', 'summon', 'courier', 'dead-drop', 'hand'] as const;
const AUDIENCES = ['leaf', 'sand', 'mist', 'cloud', 'stone', 'akatsuki', 'rain', 'underworld'] as const;
const KINDS = ['spared', 'lie', 'helped', 'witness', 'betrayal', 'humiliated', 'promise', 'debt'] as const;
const VILLAGES = ['leaf', 'sand', 'mist', 'cloud', 'stone'] as const;

/**
 * Turns the state model's snake_case JSON (see stateSchema.ts) into a
 * `TurnDiff`. Lenient: nulls, empty lists and unknown values are ignored, and
 * the older nested `state: { location, ... }` shape is still accepted.
 */
export function convertStateBlock(
  block: Record<string, unknown> | null
): { diff: TurnDiff | null; imageWorthy: boolean } {
  if (!block || typeof block !== 'object') {
    return { diff: null, imageWorthy: false };
  }

  if (Object.keys(block).length === 0) {
    return { diff: null, imageWorthy: false };
  }

  const imageWorthy = block.image_worthy === true;
  const sceneEnded = block.scene_ended === true;
  const diff: TurnDiff = {};

  if (Array.isArray(block.canon_completed)) {
    diff.canonCompleted = block.canon_completed.filter(
      (id): id is string => typeof id === 'string' && id.trim().length > 0
    );
  }

  if (Array.isArray(block.canon_engaged)) {
    diff.canonEngaged = block.canon_engaged.filter(
      (id): id is string => typeof id === 'string' && id.trim().length > 0
    );
  }

  if (Array.isArray(block.canon_passed)) {
    diff.canonPassed = block.canon_passed.filter(
      (id): id is string => typeof id === 'string' && id.trim().length > 0
    );
  }

  if (Array.isArray(block.news_relayed)) {
    diff.newsRelayed = block.news_relayed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : '',
        from: typeof item.from === 'string' ? item.from : undefined,
      }))
      .filter((item) => item.id.trim().length > 0);
  }

  if (Array.isArray(block.letters_sent)) {
    const sent = block.letters_sent
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        name: typeof item.to === 'string' ? item.to.trim() : '',
        gist: typeof item.gist === 'string' && item.gist.trim() ? item.gist.trim().slice(0, 160) : undefined,
        text: cleanString(item.text)?.slice(0, 4000),
        carrier: (CARRIERS as readonly string[]).includes(String(item.carrier)) ? (item.carrier as LetterCarrierKind) : undefined,
        coded: item.coded === true ? true : undefined,
      }))
      .filter((item) => item.name.length > 0)
      .slice(0, 3);

    if (sent.length > 0) {
      diff.lettersSent = sent;
    }
  }

  if (Array.isArray(block.letters_received)) {
    // Older replies: a list of ids; now {from, text}.
    const received = block.letters_received
      .map((item) =>
        typeof item === 'string'
          ? { name: item.trim() }
          : item && typeof item === 'object'
            ? {
                name: cleanString((item as Record<string, unknown>).from) ?? '',
                text: cleanString((item as Record<string, unknown>).text)?.slice(0, 2400),
              }
            : { name: '' }
      )
      .filter((item) => item.name.length > 0)
      .slice(0, 3);

    if (received.length > 0) {
      diff.lettersReceived = received;
    }
  }

  if (Array.isArray(block.birthdays_learned)) {
    const learned = block.birthdays_learned
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      .slice(0, 3)
      .map((name) => ({ name: name.trim() }));

    if (learned.length > 0) {
      diff.birthdaysLearned = learned;
    }
  }

  if (Array.isArray(block.names_learned)) {
    const parts = new Set(['given', 'family', 'full', 'identity']);
    const hows = new Set(['introduced', 'told', 'written', 'overheard', 'recognised']);
    const learned = block.names_learned
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        character: cleanString(item.character_id) ?? '',
        name: cleanString(item.name)?.slice(0, 60) ?? '',
        part: (typeof item.part === 'string' && parts.has(item.part) ? item.part : 'full') as NamePart,
        how: (typeof item.how === 'string' && hows.has(item.how) ? item.how : 'told') as NameHow,
      }))
      .filter((item) => item.character.length > 0 && item.name.length > 0 && item.character.toLowerCase() !== 'kan')
      .slice(0, 6);

    if (learned.length > 0) {
      diff.namesLearned = learned;
    }
  }

  if (Array.isArray(block.names_told)) {
    const told = block.names_told
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        character: cleanString(item.character_id) ?? '',
        name: cleanString(item.name)?.slice(0, 60) ?? '',
        toldTo: stringItems(item.told_to),
      }))
      .filter((item) => item.character.length > 0 && item.name.length > 0 && item.toldTo.length > 0)
      .slice(0, 3);

    if (told.length > 0) {
      diff.namesTold = told;
    }
  }

  if (Array.isArray(block.reputation)) {
    const factions = new Set(['leaf', 'sand', 'mist', 'cloud', 'stone', 'akatsuki']);
    const changes = block.reputation
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        faction: (typeof item.faction === 'string' ? item.faction.trim().toLowerCase() : '') as ReputationFaction,
        change: typeof item.change === 'number' && Number.isFinite(item.change) ? item.change : 0,
        reason: cleanString(item.reason)?.slice(0, 160),
      }))
      .filter((item) => factions.has(item.faction) && item.change !== 0)
      .slice(0, 6);

    if (changes.length > 0) {
      diff.reputation = changes;
    }
  }

  const seen = stringItems(block.bounty_seen)
    .map((item) => item.toLowerCase())
    .filter((item): item is VillageFaction => ['leaf', 'sand', 'mist', 'cloud', 'stone'].includes(item));

  if (seen.length > 0) {
    diff.bountySeen = [...new Set(seen)];
  }

  if (Array.isArray(block.life_events)) {
    const events = block.life_events
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({ name: cleanString(item.character_id) ?? '', text: cleanString(item.event)?.slice(0, 160) ?? '' }))
      .filter((item) => item.name && item.text && item.name.toLowerCase() !== 'kan')
      .slice(0, 3);

    if (events.length > 0) {
      diff.lifeEvents = events;
    }
  }

  const epithet = block.epithet;

  if (epithet && typeof epithet === 'object' && !Array.isArray(epithet)) {
    const value = epithet as Record<string, unknown>;
    const audience = cleanString(value.audience)?.toLowerCase();
    const name = cleanString(value.name);

    if (audience && name && (AUDIENCES as readonly string[]).includes(audience)) {
      diff.epithet = { audience: audience as Audience, name: name.slice(0, 60) };
    }
  }

  if (Array.isArray(block.consequences)) {
    const seeds = block.consequences
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => {
        const ref = cleanString(item.character_id);

        return {
          kind: (cleanString(item.kind)?.toLowerCase() ?? '') as ConsequenceKind,
          // The tracker's id; resolveCharacterRefs turns it into a person (or drops it).
          entityId: ref && ref.toLowerCase() !== 'null' ? ref : undefined,
          who: cleanString(item.who)?.slice(0, 120) ?? ref ?? '',
          what: cleanString(item.what)?.slice(0, 200) ?? '',
          want: cleanString(item.want)?.slice(0, 160),
          witnesses: stringItems(item.witnesses).slice(0, 6),
          faction: (VILLAGES as readonly string[]).includes(String(item.faction)) ? (item.faction as VillageFaction) : undefined,
          when: ['weeks', 'months', 'years'].includes(String(item.when)) ? (item.when as 'weeks' | 'months' | 'years') : undefined,
        };
      })
      .filter((item) => (KINDS as readonly string[]).includes(item.kind) && item.who && item.what)
      .slice(0, 2);

    if (seeds.length > 0) {
      diff.consequences = seeds;
    }
  }

  const returned = stringItems(block.consequences_returned).slice(0, 2);

  if (returned.length > 0) {
    diff.consequencesReturned = returned;
  }

  if (Array.isArray(block.grudges)) {
    const events = new Set(['wronged', 'struck', 'settled', 'forgiven']);
    const grudges = block.grudges
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        name: cleanString(item.character_id) ?? cleanString(item.name) ?? '',
        event: (typeof item.event === 'string' ? item.event.trim().toLowerCase() : '') as 'wronged' | 'struck' | 'settled' | 'forgiven',
        reason: cleanString(item.reason)?.slice(0, 160),
      }))
      .filter((item) => item.name.length > 0 && item.name.toLowerCase() !== 'kan' && events.has(item.event))
      .slice(0, 4);

    if (grudges.length > 0) {
      diff.grudges = grudges;
    }
  }

  const time = block.time;

  if (time && typeof time === 'object' && !Array.isArray(time)) {
    const rawTime = time as {
      elapsed?: unknown;
      unit?: unknown;
      clock_time?: unknown;
      days_passed?: unknown;
      time_of_day?: unknown;
    };

    const unitSeconds: Record<string, number> = {
      second: 1,
      seconds: 1,
      minute: 60,
      minutes: 60,
      hour: 3600,
      hours: 3600,
      day: 86400,
      days: 86400,
      week: 7 * 86400,
      weeks: 7 * 86400,
      month: 30 * 86400,
      months: 30 * 86400,
      year: 365 * 86400,
      years: 365 * 86400,
    };

    if (typeof rawTime.elapsed === 'number' && Number.isFinite(rawTime.elapsed)) {
      const multiplier =
        typeof rawTime.unit === 'string' ? unitSeconds[rawTime.unit.toLowerCase()] ?? 60 : 60;

      diff.state = {
        ...diff.state,
        // Up to a three-year skip; the clock step decides how much of it stands.
        elapsedSeconds: Math.max(0, Math.min(MAX_SKIP_SECONDS, Math.round(rawTime.elapsed * multiplier))),
      };
    } else if (typeof rawTime.days_passed === 'number' && Number.isFinite(rawTime.days_passed)) {
      diff.state = {
        ...diff.state,
        elapsedSeconds: Math.max(0, Math.min(MAX_SKIP_SECONDS, Math.round(rawTime.days_passed * 86400))),
      };
    }

    if (typeof rawTime.clock_time === 'string') {
      const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(rawTime.clock_time);

      if (match) {
        diff.state = {
          ...diff.state,
          clockTime: {
            hour: Math.max(0, Math.min(23, Number(match[1]))),
            minute: Math.max(0, Math.min(59, Number(match[2]))),
          },
        };
      }
    } else if (
      rawTime.time_of_day === 'morning' ||
      rawTime.time_of_day === 'afternoon' ||
      rawTime.time_of_day === 'evening' ||
      rawTime.time_of_day === 'night'
    ) {
      const legacyHours: Record<string, number> = {
        morning: 8,
        afternoon: 14,
        evening: 19,
        night: 22,
      };

      diff.state = {
        ...diff.state,
        clockTime: { hour: legacyHours[rawTime.time_of_day], minute: 0 },
      };
    }
  }

  if (
    block.scene_pace === 'combat' ||
    block.scene_pace === 'chase' ||
    block.scene_pace === 'conversation' ||
    block.scene_pace === 'travel' ||
    block.scene_pace === 'downtime'
  ) {
    diff.state = { ...diff.state, scenePace: block.scene_pace };
  }

  const beatKinds = ['exchange', 'instruction', 'remark', 'action', 'travel', 'combat'] as const;
  const beatKind = beatKinds.find((kind) => kind === block.beat);

  if (beatKind) {
    diff.beat = {
      kind: beatKind,
      with: Array.isArray(block.beat_with)
        ? block.beat_with
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0 && id.trim().toLowerCase() !== 'kan')
            .map((id) => id.trim())
            .slice(0, 6)
        : [],
    };
  }

  if (Array.isArray(block.fight_options)) {
    const options = block.fight_options
      .filter((option): option is string => typeof option === 'string')
      .map((option) => option.replace(/^[\s*"“”-]+|[\s*"“”]+$/g, '').replace(/\s+/g, ' ').trim())
      .filter((option) => option.length >= 3)
      .map((option) => option.slice(0, 90))
      .slice(0, 4);

    if (options.length > 0) {
      diff.fightOptions = options;
    }
  }

  if (typeof block.mood === 'string' && block.mood.trim()) {
    diff.state = { ...diff.state, mood: block.mood.trim().slice(0, 60) };
  }

  if (typeof block.world_description === 'string' && block.world_description.trim()) {
    diff.state = {
      ...diff.state,
      worldDescription: block.world_description.trim().slice(0, 220),
    };
  }

  // characters_present is always authoritative when it is there: [] means
  // Kan is alone now (companions are added back later). Only a missing field
  // means "unchanged" (audit 6.10).
  const listedPresent = Array.isArray(block.characters_present);
  const charactersPresent = listedPresent
    ? (block.characters_present as unknown[])
        .filter((name): name is string => typeof name === 'string' && name.trim().length > 0 && name.trim().toLowerCase() !== 'kan')
        .slice(0, SCENE_CAST_LIMIT)
    : [];

  if (listedPresent) {
    diff.state = { ...diff.state, sceneCast: charactersPresent };
  }

  if (sceneEnded || listedPresent) {
    diff.scene = {
      ended: sceneEnded,
      ...(listedPresent ? { entities: charactersPresent } : {}),
    };
  }

  const chapterTitle = cleanString(block.chapter_title)
    ?.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/[.!?]+$/, '')
    .trim();

  if (chapterTitle && chapterTitle.length >= 2) {
    diff.chapterTitle = chapterTitle.slice(0, 60);
  }

  const flashbackMark = cleanString(block.flashback)?.toLowerCase();

  if (flashbackMark === 'offered' || flashbackMark === 'started' || flashbackMark === 'ended') {
    diff.flashback = flashbackMark;
  }

  const money = convertMoney(block.money);

  if (money.length > 0) {
    diff.money = money;
  }

  const counted = readRyo(block.money_counted);

  if (counted !== null && counted >= 0) {
    diff.moneyCounted = counted;
  }

  const safehouse = convertSafehouse(block.safehouse);

  if (safehouse) {
    diff.safehouse = safehouse;
  }

  const weather = cleanString(block.weather);

  if (weather && weather.length >= 2) {
    diff.weather = weather.slice(0, 80);
  }

  const sceneTitle = cleanString(block.scene_title)
    ?.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/[.!?]+$/, '')
    .trim();

  if (sceneTitle && sceneTitle.length >= 2) {
    diff.state = { ...diff.state, scene: sceneTitle.slice(0, 60) };
  }

  const flatLocation = cleanString(block.location);
  const flatLocationKind = asLocationKind(block.location_kind);
  const flatCanonPoint = cleanString(block.canon_point);
  const inventoryAdded = stringItems(block.inventory_added);
  const inventoryRemoved = stringItems(block.inventory_removed);

  if (flatLocation || flatLocationKind || flatCanonPoint || inventoryAdded.length || inventoryRemoved.length) {
    diff.state = {
      ...diff.state,
      ...(flatLocation ? { location: flatLocation } : {}),
      ...(flatLocationKind ? { locationKind: flatLocationKind } : {}),
      ...(flatCanonPoint ? { canonPoint: flatCanonPoint } : {}),
      ...(inventoryAdded.length ? { inventoryAdded } : {}),
      ...(inventoryRemoved.length ? { inventoryRemoved } : {}),
    };
  }

  const state = block.state;

  if (state && typeof state === 'object' && !Array.isArray(state)) {
    const rawState = state as {
      location?: unknown;
      canon_point?: unknown;
      inventory_and_jutsu_changes?: unknown;
      location_kind?: unknown;
    };

    const inventoryChanges =
      Array.isArray(rawState.inventory_and_jutsu_changes) &&
      rawState.inventory_and_jutsu_changes.length > 0
        ? rawState.inventory_and_jutsu_changes.filter(
            (item): item is string => typeof item === 'string' && item.trim().length > 0
          )
        : [];

    diff.state = {
      ...diff.state,
      location:
        typeof rawState.location === 'string' && rawState.location.trim()
          ? rawState.location.trim()
          : undefined,
      locationKind:
        rawState.location_kind === 'settlement' ||
        rawState.location_kind === 'road' ||
        rawState.location_kind === 'wilderness' ||
        rawState.location_kind === 'structure'
          ? rawState.location_kind
          : undefined,
      canonPoint:
        typeof rawState.canon_point === 'string' && rawState.canon_point.trim()
          ? rawState.canon_point.trim()
          : undefined,
      inventoryAdded: inventoryChanges,
    };
  }

  if (Array.isArray(block.jutsu_used)) {
    diff.jutsuUsed = block.jutsu_used
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => {
        const jutsu = item as {
          name?: unknown;
          user?: unknown;
          chakra_nature?: unknown;
          chakraNature?: unknown;
          effect?: unknown;
          visual?: unknown;
        };

        return {
          name: typeof jutsu.name === 'string' ? jutsu.name : '',
          user: typeof jutsu.user === 'string' && jutsu.user.trim() ? jutsu.user.trim() : 'Kan',
          chakraNature:
            typeof jutsu.chakra_nature === 'string'
              ? jutsu.chakra_nature
              : typeof jutsu.chakraNature === 'string'
                ? jutsu.chakraNature
                : undefined,
          effect: typeof jutsu.effect === 'string' ? jutsu.effect : undefined,
          visual: typeof jutsu.visual === 'string' ? jutsu.visual : undefined,
        };
      })
      .filter((item) => item.name.trim().length > 0);
  }

  if (Array.isArray(block.bonds)) {
    diff.bonds = block.bonds
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => {
        const bond = item as {
          character_id?: unknown;
          character?: unknown;
          affinity_change?: unknown;
          status?: unknown;
          note?: unknown;
          relationship?: unknown;
          attraction?: unknown;
          romance_note?: unknown;
          your_change?: unknown;
          your_note?: unknown;
        };

        return {
          character:
            cleanString(bond.character_id) ?? (typeof bond.character === 'string' ? bond.character : ''),
          affinityDelta:
            typeof bond.affinity_change === 'number' ? bond.affinity_change : undefined,
          status: typeof bond.status === 'string' ? bond.status : undefined,
          note: typeof bond.note === 'string' ? bond.note : undefined,
          relationship:
            typeof bond.relationship === 'string' ? bond.relationship : undefined,
          attraction: typeof bond.attraction === 'string' ? bond.attraction : undefined,
          romanceNote:
            typeof bond.romance_note === 'string' ? bond.romance_note : undefined,
          yourDelta: typeof bond.your_change === 'number' ? bond.your_change : undefined,
          yourNote: typeof bond.your_note === 'string' ? bond.your_note : undefined,
        };
      })
      .filter((item) => item.character.trim().length > 0);
  }

  if (Array.isArray(block.facts)) {
    diff.facts = block.facts
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => {
        const fact = item as {
          entity?: unknown;
          fact?: unknown;
          type?: unknown;
          who_knows?: unknown;
          supersedes?: unknown;
          claimed_by?: unknown;
          lasts?: unknown;
          days?: unknown;
        };
        const whoKnows = stringItems(fact.who_knows);
        const supersedes = stringItems(fact.supersedes);
        const lasts: 'lasting' | 'until_rest' | 'days' | undefined =
          fact.lasts === 'lasting' || fact.lasts === 'until_rest' || fact.lasts === 'days' ? fact.lasts : undefined;
        const claimedBy = cleanString(fact.claimed_by);

        return {
          action: 'add' as const,
          type: asFactType(fact.type),
          text: typeof fact.fact === 'string' ? fact.fact : '',
          subject: cleanString(fact.entity),
          ...(whoKnows.length > 0 ? { whoKnows } : {}),
          ...(supersedes.length > 0 ? { supersedes } : {}),
          ...(claimedBy && claimedBy.toLowerCase() !== 'kan' ? { claimedBy } : {}),
          ...(lasts ? { lasts } : {}),
          ...(typeof fact.days === 'number' && Number.isFinite(fact.days) && fact.days > 0 ? { days: fact.days } : {}),
        };
      })
      .filter((item) => item.text.trim().length > 0);
  }

  const factsEnded = stringItems(block.facts_ended);

  if (factsEnded.length > 0) {
    diff.factsEnded = factsEnded;
  }

  if (Array.isArray(block.threads)) {
    diff.threads = block.threads
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => {
        const thread = item as {
          title?: unknown;
          description?: unknown;
          status?: unknown;
          participants?: unknown;
          type?: unknown;
          importance?: unknown;
        };
        const type = THREAD_TYPES.find((value) => value === thread.type);
        const importance =
          typeof thread.importance === 'number' && Number.isFinite(thread.importance)
            ? (Math.min(5, Math.max(1, Math.round(thread.importance))) as 1 | 2 | 3 | 4 | 5)
            : undefined;
        const participants = stringItems(thread.participants).filter((name) => name.toLowerCase() !== 'kan');
        const action: 'open' | 'update' | 'resolve' =
          thread.status === 'resolved' || thread.status === 'resolve'
            ? 'resolve'
            : thread.status === 'open'
              ? 'open'
              : 'update';
        const description = cleanString(thread.description);
        const title = cleanString(thread.title) ?? description ?? '';

        return {
          action,
          title: title.slice(0, 80),
          description,
          ...(type ? { type } : {}),
          ...(importance ? { importance } : {}),
          ...(participants.length > 0 ? { participants } : {}),
        };
      })
      .filter((item) => item.title.length > 0);
  }

  if (Array.isArray(block.new_characters)) {
    diff.entities = block.new_characters
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      // A known person flagged is_new: false is never re-added. (Older
      // replies without the flag are still read as new.)
      .filter((item) => item.is_new !== false)
      .map((item) => {
        const character = item as {
          name?: unknown;
          age?: unknown;
          role?: unknown;
          personality?: unknown;
          speech_style?: unknown;
          appearance?: unknown;
          appearance_block?: unknown;
          gender?: unknown;
          attracted_to?: unknown;
        };
        const gender: 'male' | 'female' | undefined =
          character.gender === 'male' || character.gender === 'female' ? character.gender : undefined;
        const attractedTo: 'men' | 'women' | 'both' | 'none' | undefined =
          character.attracted_to === 'men' ||
          character.attracted_to === 'women' ||
          character.attracted_to === 'both' ||
          character.attracted_to === 'none'
            ? character.attracted_to
            : undefined;

        return {
          isNew: true,
          name: typeof character.name === 'string' ? character.name : '',
          age: typeof character.age === 'number' ? character.age : undefined,
          role: typeof character.role === 'string' ? character.role : undefined,
          personality:
            typeof character.personality === 'string' ? character.personality : undefined,
          speechStyle:
            typeof character.speech_style === 'string' ? character.speech_style : undefined,
          appearance:
            typeof character.appearance === 'string'
              ? character.appearance
              : typeof character.appearance_block === 'string'
                ? character.appearance_block
                : undefined,
          ...(gender ? { gender } : {}),
          ...(attractedTo ? { attractedTo } : {}),
          ...((item as { minor?: unknown }).minor === true ? { minor: true } : {}),
          ...((item as { name_known?: unknown }).name_known === false ? { nameKnown: false, label: typeof character.name === 'string' ? character.name : undefined } : {}),
        };
      })
      .filter((item) => item.name.trim().length > 0);
  }

  if (Array.isArray(block.deaths)) {
    const deaths = block.deaths
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        name: cleanString(item.character_id) ?? cleanString(item.name) ?? '',
        cause: cleanString(item.cause),
      }))
      .filter((item) => item.name.length > 0 && item.name.toLowerCase() !== 'kan');

    if (deaths.length > 0) {
      diff.deaths = deaths;
    }
  }

  const revived = stringItems(block.revived).map((name) => ({ name }));

  if (revived.length > 0) {
    diff.revived = revived;
  }

  const reanimated = stringItems(block.reanimated).map((name) => ({ name }));
  const released = stringItems(block.released).map((name) => ({ name }));

  if (reanimated.length > 0) {
    diff.reanimated = reanimated;
  }

  if (released.length > 0) {
    diff.released = released;
  }

  const companionsJoined = companionRefs(block.companions_joined);
  const companionsLeft = companionRefs(block.companions_left);

  if (companionsJoined.length > 0) {
    diff.companionsJoined = companionsJoined;
  }

  if (companionsLeft.length > 0) {
    diff.companionsLeft = companionsLeft;
  }

  if (Array.isArray(block.character_updates)) {
    const updates = block.character_updates
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        name: cleanString(item.character_id) ?? cleanString(item.name) ?? '',
        mood: cleanString(item.mood),
        appearance: cleanString(item.appearance),
        lastingAppearance: cleanString(item.lasting_appearance),
        whereabouts: cleanString(item.whereabouts),
        personalityChange: cleanString(item.personality_change),
        speechStyleChange: cleanString(item.speech_style_change),
      }))
      .filter(
        (item) =>
          item.name.length > 0 &&
          (item.mood || item.appearance || item.lastingAppearance || item.whereabouts || item.personalityChange || item.speechStyleChange)
      );

    if (updates.length > 0) {
      diff.entities = [...(diff.entities ?? []), ...updates];
    }
  }

  if (Array.isArray(block.natures_gained)) {
    const natures = block.natures_gained
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        nature: cleanString(item.nature) ?? '',
        source: (item.source === 'thousand-souls' ? 'thousand-souls' : 'innate') as 'innate' | 'thousand-souls',
        from: cleanString(item.from),
      }))
      .filter((item) => item.nature.length > 0)
      .map((item) => (item.from ? item : { nature: item.nature, source: item.source }));

    if (natures.length > 0) {
      diff.naturesGained = natures;
    }
  }

  if (Array.isArray(block.abilities_changed)) {
    const abilities = block.abilities_changed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({ name: cleanString(item.name) ?? '', stage: cleanString(item.stage) }))
      .filter((item) => item.name.length > 0);

    if (abilities.length > 0) {
      diff.abilitiesChanged = abilities;
    }
  }

  if (imageWorthy) {
    diff.imageWorthy = true;
  }

  const hasChanges =
    Object.keys(diff).length > 0 &&
    Object.values(diff).some(
      (value) => Array.isArray(value) ? value.length > 0 : Boolean(value)
    );

  return { diff: hasChanges ? diff : null, imageWorthy };
}

function companionRefs(value: unknown): { name: string; reason?: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) =>
      typeof item === 'string'
        ? { name: item.trim() }
        : item && typeof item === 'object'
          ? {
              name: cleanString((item as Record<string, unknown>).character_id) ?? cleanString((item as Record<string, unknown>).name) ?? '',
              reason: cleanString((item as Record<string, unknown>).reason),
            }
          : { name: '' }
    )
    .filter((item) => item.name.length > 0 && item.name.toLowerCase() !== 'kan')
    .map((item) => (item.reason ? item : { name: item.name }));
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringItems(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : [];
}

function asLocationKind(value: unknown): LocationKind | undefined {
  return value === 'settlement' || value === 'road' || value === 'wilderness' || value === 'structure'
    ? value
    : undefined;
}

const FACT_TYPE_VALUES: FactType[] = [
  'death', 'injury', 'condition', 'secret', 'knowledge', 'membership', 'possession',
  'relationship', 'plan', 'figure', 'event', 'other',
];

function asFactType(value: unknown): FactType {
  return typeof value === 'string' && (FACT_TYPE_VALUES as string[]).includes(value)
    ? (value as FactType)
    : 'event';
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();

  if (!trimmed || trimmed === '{}') {
    return {};
  }

  const withoutFence = trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  const candidates = [withoutFence];

  const firstBrace = withoutFence.indexOf('{');
  const lastBrace = withoutFence.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(withoutFence.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

/**
 * Salvages a JSON object that was cut off part-way (the reply hit its token
 * cap). Walks back from the end to the last point where a value was complete,
 * drops the half-written tail and closes every open array and object.
 * Returns null if nothing usable is left.
 */
export function repairTruncatedJson(text: string): Record<string, unknown> | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = trimmed.indexOf('{');

  if (start === -1) {
    return null;
  }

  const body = trimmed.slice(start);
  // Cut points, newest last: [index to cut at, closers needed there].
  const cuts: Array<[number, string]> = [];
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  const closers = () => stack.slice().reverse().join('');

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{' || char === '[') {
      stack.push(char === '{' ? '}' : ']');
      cuts.push([index + 1, closers()]);
    } else if (char === '}' || char === ']') {
      stack.pop();
      cuts.push([index + 1, closers()]);

      if (stack.length === 0) {
        break;
      }
    } else if (char === ',') {
      // Everything before the comma is a finished value.
      cuts.push([index, closers()]);
    }
  }

  for (let position = cuts.length - 1, tries = 0; position >= 0 && tries < 400; position -= 1, tries += 1) {
    const [cut, close] = cuts[position];

    try {
      const parsed = JSON.parse(body.slice(0, cut) + close);

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try an earlier cut.
    }
  }

  return null;
}

/** The tracker's money changes: a signed amount and a reason each, zeros dropped. */
function convertMoney(value: unknown): { amount: number; reason: string }[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;

      const entry = item as Record<string, unknown>;
      const amount = readRyo(entry.amount);

      if (amount === null || amount === 0) return null;

      return { amount, reason: (cleanString(entry.reason) ?? '').slice(0, 80) };
    })
    .filter((item): item is { amount: number; reason: string } => Boolean(item))
    .slice(0, 6);
}

const SAFEHOUSE_KIND_VALUES = ['own', 'rented', 'borrowed', 'base', 'camp'] as const;
const SAFEHOUSE_END_VALUES = ['expired', 'destroyed', 'compromised', 'withdrawn', 'given-up'] as const;

/** The tracker's safehouse report, or null when it says nothing. */
function convertSafehouse(value: unknown): SafehouseDiff | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const item = value as Record<string, unknown>;
  const kind = cleanString(item.kind)?.toLowerCase();
  const ended = cleanString(item.ended)?.toLowerCase().replace(/\s+/g, '-');
  const id = cleanString(item.id);
  const nights = typeof item.paid_nights === 'number' && Number.isFinite(item.paid_nights) && item.paid_nights > 0 ? Math.min(item.paid_nights, 365) : undefined;
  const list = (raw: unknown, max: number) => stringItems(raw).map((entry) => entry.slice(0, 80)).slice(0, max);
  const diff: SafehouseDiff = {
    ...(id && id.toLowerCase() !== 'null' ? { id } : {}),
    ...(cleanString(item.name) ? { name: cleanString(item.name)!.slice(0, 70) } : {}),
    ...((SAFEHOUSE_KIND_VALUES as readonly string[]).includes(kind ?? '') ? { kind: kind as SafehouseKind } : {}),
    ...(nights ? { paidNights: nights } : {}),
    ...(cleanString(item.host) ? { host: cleanString(item.host)! } : {}),
    ...(list(item.stored, 8).length ? { stored: list(item.stored, 8) } : {}),
    ...(list(item.taken, 8).length ? { taken: list(item.taken, 8) } : {}),
    ...(cleanString(item.upgrade) ? { upgrade: cleanString(item.upgrade)!.slice(0, 80) } : {}),
    ...(list(item.shown_to, 8).length ? { shownTo: list(item.shown_to, 8) } : {}),
    ...(list(item.residents_joined, 4).length ? { residentsJoined: list(item.residents_joined, 4) } : {}),
    ...(list(item.residents_left, 4).length ? { residentsLeft: list(item.residents_left, 4) } : {}),
    ...((SAFEHOUSE_END_VALUES as readonly string[]).includes(ended ?? '') ? { ended: ended as SafehouseDiff['ended'] } : {}),
  };

  return Object.keys(diff).length > 0 ? diff : null;
}
