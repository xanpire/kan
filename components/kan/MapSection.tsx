import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { EmptyRow, ListCard, ListRow, SectionLabel } from '@/components/List';
import { WeatherIcon } from '@/components/WeatherIcon';
import { colors, fonts, mapColors, radius, spacing, type } from '@/constants/theme';
import { dateSortValue, formatDayMonth } from '@/lib/rpg/calendar';
import { useGame } from '@/lib/rpg/game';
import { REGION_NAME, currentRegion, type Region } from '@/lib/rpg/geography';
import { localizePlaceNames } from '@/lib/rpg/glossary';
import { BRIDGES, UNCLAIMED_LAND, labelLayout, ringPath } from '@/lib/rpg/mapShapes';
import {
  MAP_HEIGHT,
  MAP_PLACES,
  placeKnown,
  placeNote,
  MAP_WIDTH,
  REGION_SHAPES,
  regionAt,
  formatTravelDays,
  knownWhereabouts,
  mapPlace,
  placeVisits,
  placeNameSpot,
  pointOfStop,
  regionLabel,
  regionsVisited,
  routePoints,
  travelEstimate,
  type KnownWhereabouts,
  type MapPlace,
} from '@/lib/rpg/mapData';
import type { AppDatabase, CalendarDate } from '@/lib/rpg/types';
import { CONDITION_INFO, currentWeather, regionWeather, seasonLabel } from '@/lib/rpg/weather';
import {
  END_LABEL,
  activeSafehouses,
  currentSafehouse,
  formerSafehouses,
  isOvergrown,
  kindLabel,
  residentNames,
  safehouseStop,
  whoKnows,
} from '@/lib/rpg/safehouses';
import type { Safehouse } from '@/lib/rpg/types';
import { DOUBLE_TAP_SPAN, NAMES_SPAN, WHOLE_MAP, boardPoint, panBy, viewOrigin, zoomTo, type MapView } from '@/lib/rpg/mapView';
import { displayName } from '@/lib/rpg/names';

type Selection = { kind: 'place'; id: string } | { kind: 'region'; id: Region };

const REGIONS = Object.keys(REGION_SHAPES) as Region[];
const TOP_PLACES = MAP_PLACES.filter((place) => !place.parent && !place.unplaced);
const UNPLACED = MAP_PLACES.filter((place) => place.unplaced);
const ROAD_PREVIEW = 12;

function dateLine(date: CalendarDate) {
  return `${formatDayMonth(date)}, year ${date.year}`;
}

const SEA = mapColors.sea;
const LAND = mapColors.land;
const LAND_VISITED = mapColors.landVisited;
const LAND_SELECTED = mapColors.landSelected;
const BORDER = mapColors.border;
const PLACE_NAME_SIZE = 0.9;
/** How close a tap must land to a place to pick it, in board units. */
const PLACE_REACH = 2.4;

/** Each country's outline as one SVG path (several rings for island countries). */
const REGION_PATHS = Object.fromEntries(
  REGIONS.map((region) => [region, REGION_SHAPES[region].rings.map(ringPath).join('')])
) as Record<Region, string>;
const UNCLAIMED_PATH = UNCLAIMED_LAND.map(ringPath).join('');

/** What a tap at a board point means: the nearest place within reach, else the country under it. */
function selectionAt(x: number, y: number, places: MapPlace[]): Selection | null {
  let best: { id: string; distance: number } | null = null;

  for (const place of places) {
    const distance = Math.hypot(place.x - x, place.y - y);

    if (distance <= PLACE_REACH && (!best || distance < best.distance)) best = { id: place.id, distance };
  }

  if (best) return { kind: 'place', id: best.id };

  const region = regionAt(x, y);

  return region ? { kind: 'region', id: region } : null;
}

/** The board: countries, places, Kan's road and where he is. */
function WorldBoard({
  db,
  selection,
  onSelect,
}: {
  db: AppDatabase;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}) {
  const [width, setWidth] = useState(0);
  // Pinch to zoom, drag to pan, double tap to look closer (audit 11a). Only
  // the window moves; the borders and coasts stay exactly as drawn.
  const [view, setView] = useState<MapView>(WHOLE_MAP);
  const gestureStart = useRef<MapView>(WHOLE_MAP);
  const zoomed = view.span < WHOLE_MAP.span;
  const named = view.span <= NAMES_SPAN;
  const here = currentRegion(db);
  const visited = useMemo(() => regionsVisited(db), [db]);
  const visits = useMemo(() => placeVisits(db), [db]);
  // Only the places Kan knows of are on his map (audit 6b.2).
  const places = useMemo(() => TOP_PLACES.filter((place) => placeKnown(db, place, visits)), [db, visits]);
  const route = useMemo(() => routePoints(db), [db]);
  const people = useMemo(() => knownWhereabouts(db), [db]);
  const houses = useMemo(
    () =>
      activeSafehouses(db)
        .map((house) => ({ house, point: pointOfStop(safehouseStop(house)) }))
        .filter((item): item is { house: Safehouse; point: { x: number; y: number } } => Boolean(item.point)),
    [db]
  );
  const lastStop = db.state.travelLog?.[db.state.travelLog.length - 1];
  const you = (lastStop && pointOfStop(lastStop)) ?? { x: REGION_SHAPES[here].x, y: REGION_SHAPES[here].y };
  const peopleByRegion = useMemo(() => {
    const counts = new Map<Region, number>();

    for (const entry of people) {
      if (entry.basis !== 'with-you') counts.set(entry.region, (counts.get(entry.region) ?? 0) + 1);
    }

    return counts;
  }, [people]);

  const span = view.span;
  const { x: viewX, y: viewY } = viewOrigin(view);
  const height = width;

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const pick = (x: number, y: number) => {
    if (!width) return;

    const point = boardPoint(view, width, x, y);
    const picked = selectionAt(point.x, point.y, places);

    if (picked) onSelect(picked);
  };

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      gestureStart.current = view;
    })
    .onUpdate((event) => {
      setView(zoomTo(gestureStart.current, gestureStart.current.span / event.scale, width, { x: event.focalX, y: event.focalY }));
    });
  // Panning only when zoomed in, so on the whole map a drag still scrolls the page.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(zoomed)
    .minDistance(8)
    .averageTouches(true)
    .onBegin(() => {
      gestureStart.current = view;
    })
    .onUpdate((event) => {
      if (gestureStart.current.span < WHOLE_MAP.span) {
        setView(panBy(gestureStart.current, width, event.translationX, event.translationY));
      }
    });
  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .onEnd((event) => {
      setView((current) =>
        zoomTo(current, current.span > DOUBLE_TAP_SPAN ? DOUBLE_TAP_SPAN : current.span / 2, width, { x: event.x, y: event.y })
      );
    });
  const tap = Gesture.Tap()
    .runOnJS(true)
    .maxDistance(10)
    .onEnd((event) => pick(event.x, event.y));
  const gestures = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, tap));
  const selectedRegion =
    selection?.kind === 'region' ? selection.id : selection?.kind === 'place' ? mapPlace(selection.id)?.region ?? null : null;

  return (
    <View onLayout={onLayout} style={[styles.board, { height: height || 320 }]}>
      {width > 0 ? (
        <GestureDetector gesture={gestures}>
        <View accessibilityHint="Tap a country or a place; pinch or double tap to zoom" accessibilityLabel="World map" accessible>
          <Svg height={height} viewBox={`${viewX} ${viewY} ${span} ${span}`} width={width}>
            <Rect fill={SEA} height={MAP_HEIGHT} width={MAP_WIDTH} x={0} y={0} />

            <Path d={UNCLAIMED_PATH} fill="#101113" stroke="#26262a" strokeWidth={0.25} />

            {REGIONS.map((region) => {
              const shape = REGION_SHAPES[region];
              const isHere = region === here;
              const isSelected = region === selectedRegion;
              const beenThere = visited.has(region);

              return (
                <Path
                  d={REGION_PATHS[region]}
                  fill={isSelected ? LAND_SELECTED : beenThere ? LAND_VISITED : LAND}
                  key={region}
                  stroke={BORDER}
                  strokeDasharray={shape.animeOnly ? '0.9 0.5' : undefined}
                  strokeLinejoin="round"
                  strokeWidth={0.28}
                />
              );
            })}

            {/* Outlines on top, so a highlighted country isn't hidden under its neighbours' borders. */}
            {REGIONS.filter((region) => region === here || region === selectedRegion).map((region) => (
              <Path
                d={REGION_PATHS[region]}
                fill="none"
                key={`edge-${region}`}
                stroke={region === here ? colors.accent : colors.textMuted}
                strokeLinejoin="round"
                strokeWidth={0.45}
              />
            ))}

            {BRIDGES.map(([from, to], index) => (
              <Line key={`bridge-${index}`} stroke="#5a5a60" strokeWidth={0.35} x1={from[0]} x2={to[0]} y1={from[1]} y2={to[1]} />
            ))}

            {REGIONS.map((region) => {
              const shape = REGION_SHAPES[region];
              const count = peopleByRegion.get(region);
              const large = shape.size === 'large';
              const lines = labelLayout(shape);
              const fill = region === here ? colors.accentTint : large ? colors.textDim : mapColors.label;

              return (
                <G key={`label-${region}`}>
                  {lines.map((line, index) => (
                    <SvgText
                      fill={fill}
                      fontFamily={fonts.semibold}
                      fontSize={line.size}
                      key={index}
                      letterSpacing={line.letterSpacing || undefined}
                      textAnchor="middle"
                      x={line.x}
                      y={line.y}
                    >
                      {line.text}
                      {count && index === lines.length - 1 ? ` · ${count}` : ''}
                    </SvgText>
                  ))}
                </G>
              );
            })}

            {route.length > 1 ? (
              <Polyline
                fill="none"
                points={route.map((point) => `${point.x},${point.y}`).join(' ')}
                stroke={colors.accent}
                strokeDasharray="1 0.7"
                strokeLinejoin="round"
                strokeOpacity={0.6}
                strokeWidth={0.4}
              />
            ) : null}

            {places.map((place) => {
              const beenThere = visits.has(place.id);
              const isSelected = selection?.kind === 'place' && selection.id === place.id;
              const size = place.kind === 'village' ? 0.85 : 0.55;

              return (
                <Circle
                  cx={place.x}
                  cy={place.y}
                  fill={beenThere ? colors.textSoft : mapColors.hole}
                  key={place.id}
                  r={isSelected ? size + 0.45 : size}
                  stroke={isSelected ? colors.white : beenThere ? colors.textSoft : mapColors.dot}
                  strokeWidth={0.28}
                />
              );
            })}

            {/* Zoomed in, every place is named; the whole map only names the countries. */}
            {named
              ? places.map((place) => {
                  const spot = placeNameSpot(place);

                  // A dark halo under the name first, so it reads over borders and coasts.
                  return (
                    <G key={`name-${place.id}`}>
                      <SvgText fill={SEA} fontFamily={fonts.semibold} fontSize={PLACE_NAME_SIZE} stroke={SEA} strokeWidth={0.35} textAnchor={spot.anchor} x={spot.x} y={spot.y}>
                        {place.name}
                      </SvgText>
                      <SvgText fill={visits.has(place.id) ? colors.textSoft : mapColors.placeName} fontFamily={fonts.semibold} fontSize={PLACE_NAME_SIZE} textAnchor={spot.anchor} x={spot.x} y={spot.y}>
                        {place.name}
                      </SvgText>
                    </G>
                  );
                })
              : null}

            {houses.map(({ house, point }) => (
              <Rect
                fill={house.kind === 'camp' ? 'none' : mapColors.hole}
                height={1.5}
                key={house.id}
                stroke={colors.accentTint}
                strokeWidth={0.3}
                width={1.5}
                x={point.x + 0.8}
                y={point.y - 2.3}
              />
            ))}

            <G>
              <Circle cx={you.x} cy={you.y} fill={colors.accent} fillOpacity={0.2} r={2.6} />
              <Circle cx={you.x} cy={you.y} fill={colors.accent} r={1} stroke={colors.white} strokeWidth={0.28} />
            </G>
          </Svg>
        </View>
        </GestureDetector>
      ) : null}
      {width > 0 && zoomed ? (
        <Pressable
          accessibilityLabel="Show the whole map"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setView(WHOLE_MAP)}
          style={styles.zoomButton}
        >
          <Text style={styles.zoomText}>Whole map</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PersonRows({ entries }: { entries: KnownWhereabouts[] }) {
  const router = useRouter();
  const { db } = useGame();

  return (
    <ListCard>
      {entries.map((entry) => (
        <ListRow
          accessibilityRole="link"
          chevron
          key={entry.entity.id}
          meta={entry.detail}
          onPress={() => router.push({ pathname: '/bond/[id]', params: { id: entry.entity.id } })}
          title={db ? displayName(db, entry.entity) : entry.entity.name}
        />
      ))}
    </ListCard>
  );
}

function SelectedCard({ db, selection, people }: { db: AppDatabase; selection: Selection; people: KnownWhereabouts[] }) {
  const visits = placeVisits(db);
  const here = currentRegion(db);
  const place = selection.kind === 'place' ? mapPlace(selection.id) : null;
  const region: Region | null = place ? place.region : selection.kind === 'region' ? selection.id : null;
  const title = place ? place.name : region ? regionLabel(region) : 'Somewhere';
  const estimate = travelEstimate(db, region);
  const children = place ? MAP_PLACES.filter((child) => child.parent === place.id) : [];
  const regionPlaces = !place && region ? TOP_PLACES.filter((item) => item.region === region && placeKnown(db, item, visits)) : [];
  const visit = place ? visits.get(place.id) : null;
  const theirs = people.filter((entry) => entry.basis !== 'with-you' && region && entry.region === region);
  // Live weather only where Kan is; far countries show their season (audit 6b.2).
  const condition = region && region === here ? regionWeather(db, region) : null;

  let travel: string;

  if (!region) {
    travel = 'Off every road you know. You would have to find the way.';
  } else if (region === here) {
    travel = place ? 'In the country you are in now.' : 'You are here.';
  } else if (estimate) {
    travel =
      estimate.inWeather > estimate.days + 0.2
        ? `From here: ${formatTravelDays(estimate.days)} at a shinobi’s pace, ${formatTravelDays(estimate.inWeather)} in this weather`
        : `From here: ${formatTravelDays(estimate.days)} at a shinobi’s pace`;
  } else {
    travel = '';
  }

  return (
    <>
      <SectionLabel>{place ? 'Place' : 'Country'}</SectionLabel>
      <ListCard>
        <ListRow
          body={[place ? placeNote(db, place, visits) : null, travel].filter(Boolean).join('\n') || null}
          bodyLines={4}
          leading={
            condition ? (
              <View style={styles.weatherBadge}>
                <WeatherIcon color={colors.textMuted} condition={condition} night={false} size={16} />
              </View>
            ) : undefined
          }
          meta={[
            place && region ? regionLabel(region) : null,
            region
              ? condition
                ? `${CONDITION_INFO[condition].short}, ${seasonLabel(region, db.state.inStoryDate)}`
                : seasonLabel(region, db.state.inStoryDate)
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          title={title}
        />
        {visit ? (
          <ListRow
            meta={
              visit.count === 1
                ? `Once, ${dateLine(visit.first)}`
                : `${visit.count} times · first ${dateLine(visit.first)} · last ${dateLine(visit.last)}`
            }
            title="You have been here"
          />
        ) : place ? (
          <ListRow meta="Not yet" title="You have been here" />
        ) : null}
      </ListCard>

      {children.length > 0 ? (
        <>
          <SectionLabel>Inside</SectionLabel>
          <ListCard>
            {children.map((child) => {
              const childVisit = visits.get(child.id);

              return (
                <ListRow
                  body={placeNote(db, child, visits)}
                  bodyLines={2}
                  key={child.id}
                  meta={childVisit ? `Last there ${dateLine(childVisit.last)}` : 'Not yet visited'}
                  title={child.name}
                />
              );
            })}
          </ListCard>
        </>
      ) : null}

      {regionPlaces.length > 0 ? (
        <>
          <SectionLabel>Places</SectionLabel>
          <ListCard>
            {regionPlaces.map((item) => {
              const itemVisit = visits.get(item.id);

              return (
                <ListRow
                  key={item.id}
                  meta={itemVisit ? `Last there ${dateLine(itemVisit.last)}` : 'Not yet visited'}
                  title={item.name}
                />
              );
            })}
          </ListCard>
        </>
      ) : null}

      {region ? (
        <>
          <SectionLabel>Here, as far as you know</SectionLabel>
          {theirs.length > 0 ? <PersonRows entries={theirs} /> : <EmptyRow title="No one you know of" />}
        </>
      ) : null}
    </>
  );
}

/** What you can see of a place: a search while you were away shows only once you are back. */
function shownStash(house: Safehouse) {
  return house.raided && !house.raided.seen ? house.raided.lost : house.stash;
}

function knownCompromised(house: Safehouse) {
  return Boolean(house.compromised) && (!house.raided || house.raided.seen);
}

function placeMeta(db: AppDatabase, house: Safehouse, here: boolean) {
  const until = house.kind === 'rented' && house.until ? house.until : null;
  const overdue = until && dateSortValue(until) <= dateSortValue(db.state.inStoryDate);

  return [
    kindLabel(house),
    house.region ? regionLabel(house.region as Region) : null,
    here ? 'You are here' : `Last there ${dateLine(house.lastVisit)}`,
    until ? (overdue ? 'Paid time ran out' : `Paid until ${dateLine(until)}`) : null,
    knownCompromised(house) ? 'Found' : null,
    isOvergrown(db, house) ? 'Overgrown' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function placeBody(db: AppDatabase, house: Safehouse) {
  const known = whoKnows(db, house);
  const stash = shownStash(house);
  const residents = residentNames(db, house);

  return [
    house.place && house.place !== house.name ? localizePlaceNames(house.place) : null,
    known.length > 0 ? `Who knows: ${known.join(', ')}` : 'No one else knows of it',
    residents.length > 0 ? `Living there: ${residents.join(', ')}` : null,
    stash.length > 0 ? `Stashed: ${stash.join(', ')}` : null,
    house.upgrades.length > 0 ? `Built up: ${house.upgrades.map((item) => item.name).join(', ')}` : null,
    house.raided?.seen ? `Searched while you were away${house.raided.lost.length ? `: ${house.raided.lost.join(', ')} gone` : ''}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/** "2 to go back to · 1 former". */
function placesLine(db: AppDatabase) {
  const active = activeSafehouses(db).length;
  const former = formerSafehouses(db).length;
  const parts = [active === 0 ? 'Nowhere to go back to, yet' : `${active} to go back to`, former > 0 ? `${former} former` : null];
  return parts.filter(Boolean).join(' · ');
}

/** Kan's places: safehouses, rooms, hideouts, camps, and the ones he lost. */
function PlacesList({ db }: { db: AppDatabase }) {
  const here = currentSafehouse(db)?.id;
  const active = [...activeSafehouses(db)].sort((a, b) =>
    a.id === here ? -1 : b.id === here ? 1 : dateSortValue(b.lastVisit) - dateSortValue(a.lastVisit)
  );
  const former = formerSafehouses(db);
  const [allFormer, setAllFormer] = useState(false);
  const shownFormer = allFormer ? former : former.slice(0, 5);

  return (
    <>
      <SectionLabel>Your places</SectionLabel>
      {active.length > 0 ? (
        <ListCard>
          {active.map((house) => (
            <ListRow body={placeBody(db, house)} bodyLines={8} key={house.id} meta={placeMeta(db, house, house.id === here)} title={house.name} />
          ))}
        </ListCard>
      ) : (
        <EmptyRow body="Wherever you sleep or settle in can become one." title="Nowhere to go back to, yet" />
      )}

      {former.length > 0 ? (
        <>
          <SectionLabel>Former places</SectionLabel>
          <ListCard>
            {shownFormer.map((house) => (
              <ListRow
                body={house.ended?.note ? house.ended.note.charAt(0).toUpperCase() + house.ended.note.slice(1) : null}
                key={house.id}
                meta={[
                  house.ended ? `${END_LABEL[house.ended.reason]} ${dateLine(house.ended.on)}` : null,
                  house.region ? regionLabel(house.region as Region) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                title={house.name}
              />
            ))}
            {former.length > 5 ? (
              <ListRow
                accessibilityRole="button"
                onPress={() => setAllFormer((value) => !value)}
                title={allFormer ? 'Show less' : `Show all ${former.length}`}
              />
            ) : null}
          </ListCard>
        </>
      ) : null}
    </>
  );
}

export function MapSection() {
  const { db } = useGame();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [wholeRoad, setWholeRoad] = useState(false);
  // Below the board and the selected place, the long lists open from rows (audit 11a).
  const [open, setOpen] = useState<'places' | 'road' | 'unplaced' | 'people' | null>(null);
  const toggle = (which: NonNullable<typeof open>) => setOpen((current) => (current === which ? null : which));

  const people = useMemo(() => (db ? knownWhereabouts(db) : []), [db]);
  const road = useMemo(() => [...(db?.state.travelLog ?? [])].reverse(), [db]);

  if (!db) return null;

  const here = currentRegion(db);
  const weather = currentWeather(db);
  const lastStop = db.state.travelLog?.[db.state.travelLog.length - 1];
  const herePlace = mapPlace(lastStop?.placeId);
  const shown: Selection = selection ?? (herePlace && !herePlace.parent ? { kind: 'place', id: herePlace.id } : { kind: 'region', id: here });
  const withYou = people.filter((entry) => entry.basis === 'with-you');
  const elsewhere = people.filter((entry) => entry.basis !== 'with-you');
  const byRegion = new Map<Region, KnownWhereabouts[]>();

  for (const entry of elsewhere) byRegion.set(entry.region, [...(byRegion.get(entry.region) ?? []), entry]);

  const visibleRoad = wholeRoad ? road : road.slice(0, ROAD_PREVIEW);

  return (
    <>
      <SectionLabel>You are here</SectionLabel>
      <ListCard>
        <ListRow
          leading={
            <View style={styles.weatherBadge}>
              <WeatherIcon color={colors.accentTint} condition={weather.condition} night={weather.night} size={16} />
            </View>
          }
          meta={`${regionLabel(here)} · ${CONDITION_INFO[weather.condition].short}, ${weather.seasonLabel}`}
          title={localizePlaceNames(db.state.location)}
        />
        {withYou.length > 0 ? (
          <ListRow meta="Travelling with you" title={withYou.map((entry) => displayName(db, entry.entity)).join(', ')} />
        ) : null}
      </ListCard>

      <WorldBoard db={db} onSelect={setSelection} selection={shown} />
      <Text style={styles.legend}>
        Pinch or double tap to zoom, drag to look around. White dots: places you have been. Red line: your road. Squares: your places. Numbers: people you know of there.
      </Text>

      <SelectedCard db={db} people={people} selection={shown} />

      <ListCard>
        <ListRow
          accessibilityState={{ expanded: open === 'places' }}
          chevron={open !== 'places'}
          meta={placesLine(db)}
          onPress={() => toggle('places')}
          title="Your places"
        />
        <ListRow
          accessibilityState={{ expanded: open === 'road' }}
          chevron={open !== 'road'}
          meta={road.length === 0 ? 'It starts here' : road.length === 1 ? '1 stop' : `${road.length} stops`}
          onPress={() => toggle('road')}
          title="Your road"
        />
        <ListRow
          accessibilityState={{ expanded: open === 'people' }}
          chevron={open !== 'people'}
          meta={elsewhere.length === 0 ? 'No one you know of, yet' : elsewhere.length === 1 ? '1 person' : `${elsewhere.length} people`}
          onPress={() => toggle('people')}
          title="Where people are, as far as you know"
        />
        <ListRow
          accessibilityState={{ expanded: open === 'unplaced' }}
          chevron={open !== 'unplaced'}
          meta={`${UNPLACED.length} lands`}
          onPress={() => toggle('unplaced')}
          title="Not on any map you know"
        />
      </ListCard>

      {open === 'places' ? <PlacesList db={db} /> : null}

      {open === 'road' ? (
        <>
      {road.length > 0 ? (
        <ListCard>
          {visibleRoad.map((stop, index) => (
            <ListRow
              key={`${stop.date.year}-${stop.date.month}-${stop.date.day}-${stop.date.hour}-${stop.date.minute}-${index}`}
              meta={`${dateLine(stop.date)}${stop.region ? ` · ${regionLabel(stop.region as Region)}` : ''}`}
              title={localizePlaceNames(stop.place)}
            />
          ))}
          {road.length > ROAD_PREVIEW ? (
            <ListRow
              accessibilityRole="button"
              onPress={() => setWholeRoad((value) => !value)}
              title={wholeRoad ? 'Show less' : `Show all ${road.length} stops`}
            />
          ) : null}
        </ListCard>
      ) : (
        <EmptyRow title="Your road starts here" />
      )}
        </>
      ) : null}

      {open === 'people' ? (
        <>
      {byRegion.size > 0 ? (
        <>
          <Text style={styles.legend}>What you were told or last saw. It may not be true any more.</Text>
          {[...byRegion.entries()].map(([region, entries]) => (
            <View key={region} style={styles.group}>
              <Text style={styles.groupLabel}>{regionLabel(region)}</Text>
              <PersonRows entries={entries.slice(0, 12)} />
            </View>
          ))}
        </>
      ) : (
        <EmptyRow title="No one you know of, yet" />
      )}

        </>
      ) : null}

      {open === 'unplaced' ? (
        <>
      <ListCard>
        {UNPLACED.map((place) => (
          <ListRow
            accessibilityRole="button"
            body={place.note ?? null}
            bodyLines={2}
            key={place.id}
            meta={placeVisits(db).get(place.id) ? 'You have been there' : 'Location unknown'}
            onPress={() => setSelection({ kind: 'place', id: place.id })}
            title={place.name}
          />
        ))}
      </ListCard>

        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  board: {
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: mapColors.board,
  },
  zoomButton: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(15, 15, 15, 0.85)',
  },
  zoomText: {
    ...type.rowMeta,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
  },
  legend: {
    ...type.rowMeta,
    color: colors.textDim,
    marginTop: -spacing.xs,
  },
  weatherBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  group: {
    gap: spacing.xs,
  },
  groupLabel: {
    ...type.rowMeta,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    paddingHorizontal: spacing.xs,
  },
});
