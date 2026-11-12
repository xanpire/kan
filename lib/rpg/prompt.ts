import { advanceSeconds, calculateAge, dateSortValue, daysBetween, entityAge, formatClock, formatDate } from './calendar';
import { paceMinimumSeconds } from './pacing';
import { normalizeJutsuNature } from './jutsu';
import { ROMANCE_RULES, eraNoteFor, loreProfileFor } from './romance';
import { endgameNote } from './canonEndgame';
import { eraTitle } from './canonData';
import { characterRefs, mentionsEntity, refByEntityId } from './characterRefs';
import {
  activeCanonMilestones,
  canonStoryOver,
  recentCanonEvents,
  recentlyConcludedMilestones,
  upcomingCanonMilestones,
  PERSONAL_OFFERS_PER_TURN,
  upcomingWorldMilestones,
  isCombatPace,
  hasHeardNews,
} from './canon';
import { formatNewsOffer, newsOffer, newsTrackingLines, trackedCanonBeats } from './newsDelivery';
import { formatLetterOffer, letterTrackingLines, turnLetterOffer } from './letters';
import { reunionNotes } from './lives';
import { latestPov, povCandidates, povInstruction } from './povMemories';
import { consequenceTrackingLines, formatConsequenceOffer, turnConsequenceOffer } from './consequences';
import { epithetLines, formatRenownBlock, renownTrackingLine } from './renown';
import { regionOf, travelDaysBetween } from './geography';
import {
  formatEncounterConditions,
  locationKindOf,
} from './encounters';
import { formatReturningCharacter } from './returning';
import { formatYearlyBlock, yearlyOffer, yearlyTrackingLines } from './yearly';
import { GRUDGE_RULES, formatGrudgeOffer, grudgeOffer, grudgeStage, grudgeTrackingLines } from './grudges';
import { formatHunterOffer, formatReputationBlock, hunterOffer, reputationTrackingLines } from './reputation';
import { estimateTokens } from '../openrouter';
import { DEFAULT_SETTINGS } from './defaults';
import { PLACE_NAME_RULE, localizePlaceNames } from './glossary';
import { REANIMATED_LOOK, isDeceased, isReanimated, kanKnowsDeath } from './deaths';
import { canonRoleAhead, canonSurvivalLine } from './canonRoles';
import { FULL_CARD_LIMIT } from './sceneLimits';
import { formatTimeSkipLine } from './timeSkip';
import { resolveEntity } from './entities';
import { alsoKnownAs, displayName, identitiesOf, identityLine, kanKnowsLine, kanKnowsName, labelOf, narratorName } from './names';
import { companionsOf, daysTogether, formatTogether } from './companions';
import { relevantFacts, retrieveMemories, triggeredLore } from './retrieval';
import { factRef, knowerNames } from './facts';
import { formatAbilities } from './abilities';
import { formatVarietyBlock } from './variety';
import { formatWeatherLine, formatWeatherTracking } from './weather';
import { currentSafehouse, formatSafehouseLine, formatSafehouseTracking, letterAddress, placesLine } from './safehouses';
import { WORLD_AREAS, type WorldArea } from './stateSchema';
import { PRICE_GUIDE, formatPurseLine } from './money';
import { KAN_FATE_RULE } from './kanFate';
import { CONVERSATION_MODE_MINIMUM_SECONDS, formatSceneModeLine, formatSceneModeTracking, resolveTurnMode } from './sceneMode';
import {
  activeFlashback,
  flashbackOffer,
  flashbackTrackingLines,
  flashbackView,
  formatFlashbackBlock,
  formatFlashbackOffer,
  formatFlashbackReturn,
} from './flashbacks';
import type {
  AppDatabase,
  BondRecord,
  EntityRecord,
  EventRecord,
  FactRecord,
  JutsuRecord,
  OpenRouterMessage,
  RawLogEntry,
  SceneModeName,
  ThreadRecord,
} from './types';

const MIN_SCENE_MESSAGES = 4;
const STORY_CHAPTERS = 3;

export const NARRATION_SYSTEM = `You narrate an interactive Naruto novel. The player is Kan; you run the world and everyone else.

CORE
- Never speak, act, think, or decide for Kan. You may give Kan's senses and body (what he sees, hears and feels, his pulse, his pain, the pull of his chakra); never his words, choices, opinions or plans. Describe the world and the reactions, then stop where Kan must respond. When Kan asks for time to pass (train, wait, travel, rest), compress it into one reply, say plainly how long it took, and stop at the first moment that needs him. End on a beat that leaves room to act: an action, an image, a sound, an NPC line, a threat, or an open moment. At most about one reply in three ends on a direct question to Kan. Never re-ask a decision Kan has already made.
- When anyone asks Kan a question, gives him an order, or makes him an offer, the turn ends right there. Never write his answer, his obedience, or what happens next: no walking, travel, or time passing until Kan replies. A plan someone speaks ("walk until nightfall") has not happened yet.
- ${PLACE_NAME_RULE}
- The dead stay dead. Anyone under THE DEAD never appears alive, speaks, or acts: only as a memory, a dream, a grave, or a body, or through a revival or reanimation the canon timeline allows. Where it says Kan does not know yet, never reveal the death through narration; he learns it only through someone who could know.
- Anyone under TRAVELLING WITH KAN is physically at his side in every scene until the story shows them leave: give each of them a real presence every turn (a line, a look, an action, a judgment of their own) in their own voice. They never vanish, wander off unexplained, or get forgotten; they part ways only when the story makes it happen (they choose to go, Kan sends them away, they are called away, captured, or killed). What they live through beside Kan, good or bad, changes how they feel about him. Someone joins only when the story makes it clear they are coming along.
- Kan carries only what CURRENT STATE lists under Inventory: never give him a weapon, tool or item he does not have, and when he uses one up or loses it, show it.
- Kan's money is the Purse in CURRENT STATE. He can never pay more than he has; when he is short, the seller says so. Whenever money changes hands for Kan (he pays, is paid, finds, wins, loses or is robbed), say how much in ryō, at believable prices. Someone else may pay for him. ${PRICE_GUIDE}
- Characters have the age, rank, and knowledge they would have on the current date, and goals of their own: they can refuse, lie, or leave. Canon power levels hold, with no power creep or nerfing. Trust and love are earned.
${KAN_FATE_RULE}
- The supplied state, characters, bonds, facts, threads, summaries, and memories are truth, and win over canon where they differ. Characters know only the secrets they learned in this story. Open threads are binding: never change a mission's goal, destination, or allies unless Kan does.

TIME
- The TIME block is the only date. Never write a calendar date; use relative time ("the next morning", "two nights later"). Name an exact hour only when the story fixes one, and then exactly as TIME gives it (never "half past one" when it is 1:43).
- Numbers stay true: a bounty, distance, deadline, price or travel time, once said, never changes (see FIGURES ALREADY SAID), and travel takes the times in GEOGRAPHY. Nobody can be in two places: see ELSEWHERE.
- Say plainly how long things take ("a few heartbeats", "an hour later", "by dusk", "after a full night's sleep", "three days on the road"); the app reads the clock from your words. Be honest: blows take seconds, talks minutes, battles minutes to hours, a nap under an hour, a night's sleep 8-9 hours. Never skip time in a fight; Kan controls each move.

CANON
- Canon happens on schedule unless Kan plausibly changes it. Nothing has happened unless it is in the CANON TIMELINE, NEWS & RUMORS, RUMORS OF WHAT'S COMING, or the facts: never invent a canon death, battle, exam, or date. Asked about anything else, NPCs say it hasn't happened, don't know, or deflect.
- The world moves while Kan is elsewhere, but he learns of it only through people, reports, couriers, or gossip, never omniscient narration. Deliver NEWS & RUMORS through a plausible bearer, preferring someone already in the scene, in the delivery given, and make clear who told him: at most one piece of news per turn (a CATCH-UP report is one report covering several), and none in the middle of a fight. Never re-narrate a finished event. If the scene reaches an ACTIVE STORY BEAT, play it out fully.
- Letters are personal, never canon news. A LETTER FOR YOU arrives the way it says, in its writer's own voice. When Kan writes to someone far away, show him send it (a bird, a courier, a dead drop); it takes days to arrive, so any answer comes much later, never in the same scene. Kan writes his letters himself: never reword them. A letter to the dead is never sent; it is kept, burned, or left at a grave.
- People live their own lives while Kan is away. A "since you last saw them" note says what changed for someone he meets again; let it show. SOMETHING COMES BACK and TALK OF YOU are optional: use them only when they fit, and only as the world would really carry them.
- The man in the orange swirl mask is one person, whatever he is called; his card in CHARACTERS IN SCENE says which identity he is using and who knows him as what. The real Madara is a separate character who appears later. Other masked people (Kakuzu, ANBU) are not him.
- Pain is one entity acting through six bodies (Deva, Asura, Animal, Human, Preta, Naraka) that share all they see. Zetsu, Black and White, is one character; White Zetsu clones are expendable copies.

NAMES
- Narration calls people only by the name Kan knows (each card says it). Anyone he can't name gets the same short description every time ("the red-haired girl") until he learns the name: they give it, someone says it, a letter or document shows it, or he recognises someone famous by their look. Never force an introduction.
- Characters say names aloud when they naturally would ("Tobi!", "Itachi-san"), each using the name THEY know the person by. A "narrator only" truth is never narrated or said by someone who couldn't know it.
- If Kan says a name he couldn't know, he says it aloud and people react ("How do you know that name?").

STYLE
- Second person, gritty realism: weight, fatigue, injury, weather, terrain. Show moods through behavior. Quiet moments are fine.
- Weather and season follow the WEATHER line, the same all scene: let them show, slow travel, hide or reveal tracks, and change footing and sight in a fight.
- 2-4 paragraphs of plain English (unless SCENE MODE says otherwise): common words, short to medium sentences, few em dashes or semicolons. Concrete imagery, but never reuse a description, metaphor, gesture, or line from the recent scene. Every beat moves the story.
- Play out conversations, fights, and travel unless Kan asks to skip; compress uneventful travel into a paragraph or two.
- Encounters are rare and must fit the ENCOUNTER CONDITIONS (place, hour, how crowded). Most turns bring no new people; when a place is isolated, use animals, weather, sounds, or tracks. No cheerful strangers in empty wilderness or ruins at night, and never two encounters in a row.
- New characters get a distinct name, age, role, personality, voice, look, and goals, within canon power levels.
- In Kan's input, "quoted text" is spoken and *asterisks* are actions.

SCENE MODES (the turn's SCENE MODE line says which applies; with none, write as above)
- Conversation: mostly speech, like talking to them directly. Length follows the talk: one line or a longer speech; someone can ask one question and stop. Between lines, only short action lines in asterisks (*Sasuke looks away.*), no scenery. Several people can speak, each in their own voice. Kan's small moves in place (a look, a touch, sitting, stepping closer, pouring tea, a flash of the Sharingan) and his silences are part of the talk; answer them the same way. Seconds to a minute or two pass.
- Talk is building: shorter and more spoken than usual.
- The conversation ends: a short transition in normal prose, then carry on normally.
- Fight: short exchanges. Show honestly what Kan's move does, by canon power levels and his real jutsu, chakra and wounds (a bad call hurts), then give the opponent's one specific next move ("Kakuzu's arm launches on threads, straight at your throat") and stop there, before it lands. One or two short paragraphs, a few seconds of fight time; wounds, chakra and positions carry over; short taunts are fine. If this exchange ends the fight, close with a short paragraph of aftermath in normal prose instead.

${ROMANCE_RULES}

${GRUDGE_RULES}

OUTPUT
- Story prose only, starting straight in the scene: no JSON, code, lists, headings, labels, summaries, or out-of-character notes. Speech in quotation marks; *asterisks* only for NPC thoughts and the short action lines of a conversation.
- The app tracks state from your prose, so make changes clear in it: where Kan goes, who is there, which jutsu are used and how they look, what is learned or promised, and when a scene ends.`;

const STATE_SYSTEM = `You are the state tracker for an interactive Naruto novel; the player is Kan. Read the narrator's latest turn and return one JSON object matching the schema. Never write story text. A second tracker records letters, safehouses, reputation, grudges, canon, news, weather, natures and abilities; leave those to it.

TIME: time.elapsed + time.unit is the in-story time this turn covered, read from the prose. Blows take seconds, talks minutes, battles minutes to hours, a nap under an hour, a night's sleep 8-9 hours, travel minutes to days, and a time skip Kan asked for (weeks, months, years) exactly as long as the prose says passed; a new day must be covered. Count only what the narration shows happening: plans or times spoken in dialogue ("walk until nightfall", "we leave at dawn") have not happened and add nothing. time.clock_time stays null unless the narration itself names the hour ("at noon", "by dusk", "3 PM"); never guess it. TIME BEFORE THIS TURN is the clock the turn starts from, so a clock_time must fit it plus time.elapsed. scene_pace: combat (any fight or ambush, even a short one, while blows are still being traded at the end of the reply), chase, conversation, travel (only moving from place to place with no fight), or downtime (rest, sleep, waiting).

- Prefer null to a guess. A wrong value does more harm than a missing one.
- Report only what THIS turn shows changed: null when unchanged, [] when empty. Never invent anything or contradict the state below.
- Every text you write calls Kan "you", never "Kan", "he" or "him" (facts, threads, world_description, canon_point, bond status and notes, jutsu effects and visuals, scene titles). Only ids and the jutsu "user" field use "kan".

PLACE: location, with location_kind, when Kan moves. location_kind: settlement (a village, town, camp or market), structure (inside or on a building: a tower, a cell, a shrine, a hideout), road (a road, bridge or trail), wilderness (forest, ravine, mountains, river, open land). Never put Kan in characters_present. mood (1-3 words), world_description (one sentence), and canon_point (one line) only when changed. inventory_added / inventory_removed. money: every change to your own money on the page, in ryō: amount negative when you pay, lose, give away or are robbed of money, positive when you are paid, given, find, win or take it; reason in a few words ("a room at the inn", "Kakuzu's cut of the bounty"). Someone else paying for you changes nothing, and money only talked about has not moved. Use the amount the prose names; if it names none, estimate it from PRICES; a payment is never more than the Purse in CURRENT STATE. money_counted: your total, only when the prose states exactly how much you have now; otherwise null. Money is never an inventory item. ${PRICE_GUIDE}

PEOPLE: refer to every person by their id from KNOWN CHARACTERS (Kan is "kan") in characters_present, bonds.character_id, character_updates.character_id, facts.entity, facts.who_knows, and jutsu_used.user. Match every name, title, nickname, and alias against KNOWN CHARACTERS first ("Kisame", "Hoshigaki", and "the shark-faced swordsman" are all kisame-hoshigaki), including people Kan has not met yet. A description belongs to whoever the prose means by it ("the masked man" who is Kakuzu is kakuzu): never pick an id because its name looks like a description. new_characters is ONLY for a person missing from KNOWN CHARACTERS: is_new true, their fullest known name, age, role, personality, speech, appearance, gender, attracted_to (men, women, both, none, or unknown if the story hasn't shown it), minor (true for a one-scene character: a target, a guard, a shopkeeper), and name_known (false for a stranger the story gives no name yet: name is then a short description of how they look to you, like "the scarred ferryman"); elsewhere this turn, refer to them by that exact name. Never put a listed person in new_characters. characters_present lists only those physically in the scene at the end; [] if Kan is alone. character_updates: visible mood changes; whereabouts when the story says where someone is going or waiting ("waiting at the eastern border"); appearance is how they look RIGHT NOW (what they are wearing, wet, bloodied, Sharingan active), kept the same from turn to turn unless the prose changes it; lasting_appearance only for a real lasting change (aging, a scar, new clothes worn for good). personality_change / speech_style_change: almost always null; only when the story truly changes who an original (non-canon) person is, as a new one-line description. bonds have two sides. affinity_change (-10..10) and note: how THEY feel about you, moved only by what they could actually see or hear you do or say. your_change and your_note: how YOU feel about them; your inner thoughts and unspoken reactions move only this side. relationship is one fixed label: stranger, acquaintance, friendly, close, old friend, family, teammate, partner (an Akatsuki or mission partner, never romance), mentor, student, rival, enemy, romantic interest, lover (romance), rejected, ex; change it only when the relationship itself changes, never because feelings dipped. attraction and romance_note only if changed. Only important characters; minor people go in facts.

NAMES: you see everyone's true identity and id; the notes say what name you (Kan) know each by. Every text you write (facts, notes, threads, letters, world_description) names people only as you knew them at that moment, or describes them ("the masked man"). names_learned: {character_id, name, part, how} only when a name is spoken, written or recognised within your hearing or reading this turn and you did not know it: part given, family, full, or identity (another name they go by: "Madara" for the masked man, "Obito" when his mask breaks); how introduced (they said it), told (someone else said it), written (a letter, a document, a poster), overheard, or recognised (the prose shows you could tell who someone famous is by their look). A name spoken out of your hearing never counts. names_told: {character_id, name, told_to} when someone present learns another name a person goes by, in front of you (you tell Deidara who Tobi really is). Otherwise [].

COMPANIONS: people marked [travelling with Kan] are with him in every scene; always list them in characters_present. companions_joined lists, by id, someone who clearly sets out with Kan this turn (agrees to come along, is assigned as his partner, leaves with him), with a short reason; companions_left lists a companion who truly parts ways (leaves, is sent away, called back, captured, or splits off on their own mission), with a short reason. Scouting ahead, sleeping in the next room, or a short errand is not leaving. Companions share what happens to Kan: give a companion a bonds entry whenever this turn's shared events move how they feel about him (fighting side by side, being protected or saved, a secret shared, kindness, an argument, a betrayal); affinity_change usually -3..3.

DEATHS: deaths lists, by id, anyone the prose makes certain is dead this turn: they die on screen, Kan sees the body, or someone tells Kan they died (also for someone already marked deceased whom Kan did not know about). Never for someone unconscious, missing, faking, or only rumored dead. The dead are never in characters_present or bonds, except the reanimated. revived lists ids only for a true return to life (like Chiyo's life-transfer jutsu, or the Rinnegan's revival). reanimated lists ids of the dead whom the prose shows brought back by Edo Tensei this turn (still dead, but here and able to act): while that holds they may be in characters_present, share memories and move a bond. released lists reanimated people whose jutsu ends this turn (released, sealed, passing on).

JUTSU: jutsu_used lists every named jutsu, by anyone, and every use of one of your recorded techniques, including your taijutsu when you fight, sneak or strike with it. chakra_nature is Fire, Water, Wind, Earth, Lightning, Wood, Ice, Lava, Boil, Storm, Yin, Yang, Yin-Yang, Physical, Genjutsu, Space-Time, or Unknown; for a blend pick the primary and describe the blend. Kan's own jutsu keep the exact name the player wrote ("Fire Style: Hell" stays "Fire Style: Hell", never a generic canon name like "Fire Release"); for a jutsu already on record, reuse its recorded name. "Style" and "Release" mean the same. Keep effect and visual short and consistent with earlier uses.

MEMORY: facts are what actually happened or is now true, never what someone merely said. Every fact has entity (who it is about; "kan" for you), a type, and who_knows (ids of people who know it, or group names like "Hidden Leaf leadership"). Types: death (someone died), injury (a wound to someone's body), condition (a passing state: chakra drain, exhaustion, soaked, a headache, Sharingan active), secret, knowledge (someone learned something), membership (joined or left a group), possession (an item gained, lost or changed: tying or scratching a headband is possession, never injury), relationship, plan (an intention or travel plan), figure (a number stated in the story: a bounty, a price, a distance, a deadline, a travel time, word for word), event (anything else that happened; "the clan is dead" is an event, not a death fact about whoever did it). A boast, rumor or claim gets claimed_by (the speaker's id), or is left out. lasts: "until_rest" for a condition that a night's sleep ends, "days" (with days) for an injury or plan with an expected length, "lasting" otherwise. When a fact replaces an ACTIVE FACT (you learned what you did not know, a plan changed, a wound healed), list that fact's ref in supersedes; list refs that simply stopped being true in facts_ended. threads are promises, debts, grudges, mysteries, quests, or goals, with type (quest: a mission or task to carry out; goal: something you want to achieve; promise; debt; mystery: a question you want answered; grudge; other), importance (1 small to 5 life-defining), and participants (ids of who it involves besides you): "open" only for something no OPEN THREAD already covers (if one does, "update" it under its exact title, even when the wording differs); "update" or "resolved" reuse the exact title. scene_ended is true only when the scene clearly concluded. scene_title names the scene in 2-5 words (like "Ambush at the river ford"), only when this turn starts a new scene (Kan reaches a new place, a new day begins, a new encounter or conversation takes over) or the current Scene name no longer fits; otherwise null. chapter_title (3-6 words) only when this turn truly opens a new chapter of the story: a major milestone has just been reached, Kan arrives somewhere far from where the chapter began (a new country, the Akatsuki's hideout), or a long time skip; most turns, and most new scenes, are null. A chapter is long: many scenes, often days of story.

BEAT: beat tags how this turn played, from Kan's input and the reply together: exchange (back-and-forth talk, including small moves in place or a silence the other person reacts to while still talking: a look, a touch, a gesture, sitting or standing, stepping closer, turning away, pouring tea, a flash of the Sharingan), instruction (someone tells Kan to do something that leads into action: "follow me", "wait here"), remark (a one-off line in passing), action (a move that changes the scene: leaving, going somewhere, a jutsu that changes the situation, someone new taking over), travel, or combat (any fight, even a short one, still going at the end of the reply). When the fight stops in this reply (the opponent backs off, breaks away, is beaten or flees, or the blows stop and talk takes over), the beat is exchange, remark or action, not combat, scene_pace is not combat, and fight_options is []. beat_with: ids of the people Kan is talking with (exchange, instruction, remark); otherwise []. fight_options: only when the fight goes on and the reply ends on an opponent's move: 3-4 short moves Kan could make next (under 10 words, starting with a verb, no "I" or "you": "Duck under the threads and close in"), fitting the moment and what he can really do (dodge, block, counter, and at least one jutsu he knows); otherwise [].

IMAGE: image_worthy is true only for visually striking moments, never pure dialogue.`;

/**
 * The World call (audit 7): asked only when this turn touched one of its
 * areas, with only those areas' rules. The header and the roster sit in the
 * cached front; the area rules go with the turn.
 */
const WORLD_STATE_SYSTEM = `You are the second state tracker for an interactive Naruto novel; the player is Kan. Read the narrator's latest turn and return one JSON object matching the schema: only the areas listed under THIS CALL. Another tracker records time, place, who is present, bonds, facts, threads and jutsu; leave those alone. Never write story text.

- Prefer null to a guess. A wrong value does more harm than a missing one.
- Report only what THIS turn shows changed: null when unchanged, [] when empty. Never invent anything or contradict the state below.
- Every text you write calls Kan "you", never "Kan", "he" or "him". Only ids use "kan".
- Refer to every person by their id from KNOWN CHARACTERS (Kan is "kan"). Match every name, title, nickname and description against KNOWN CHARACTERS first; someone missing from it goes by the fullest name the prose gives. Every text you write names people only as you (Kan) knew them at that moment, or describes them ("the masked man").`;

const WORLD_AREA_RULES: Record<WorldArea, string> = {
  letters: `LETTERS: letters_sent and letters_received use character ids, by the rules under LETTERS; otherwise [].`,
  safehouse: 'SAFEHOUSE: safehouse follows the rules under SAFEHOUSES.',
  enemies: `NAME & ENEMIES: reputation, bounty_seen, epithet, grudges, consequences, and consequences_returned follow the rules under REPUTATION & GRUDGES; otherwise [] (epithet null).`,
  lives: `LIVES: life_events: {character_id, event} for something that happened in a person's own life away from you that this turn reveals as true (a promotion, an injury, a move, a new team, a wedding; their letter, or they tell you); event in a few words, third person without their name ("was promoted to jonin"); otherwise []. birthdays_learned: ids of people whose birthday you learn on the page this turn (they say it, someone tells you); otherwise [].`,
  abilities: `ABILITIES: natures_gained when you learn one of your own chakra natures (source "innate") or take one with Thousand Souls (source "thousand-souls", from = whose chakra); abilities_changed when one of your abilities awakens or changes stage (name "Sharingan" stage "1 tomoe"/"2 tomoe"/"3 tomoe"; "Mangekyō Sharingan" "awakened"; "Susanoo" "ribcage"/"full body"...). Otherwise [].`,
  canon: `CANON: canon_engaged / canon_completed / canon_passed / news_relayed use ids exactly as listed under CANON TRACKING, only when that id's rule is met; otherwise []. A catch-up report can relay several listed news ids in one turn.`,
  weather: `WEATHER: weather: a few words for the sky the reply shows, whenever it differs from WEATHER NOW or changes it. If the reply describes rain, a downpour, drizzle, snow, sleet, fog, a storm, strong wind or a clear sky that WEATHER NOW does not say, set weather to it (\"heavy rain\", \"fog rolling in\"), even if it was already falling before this turn; when rain or snow stops, say so (\"the rain stops\"). Null only when the reply shows no weather or the same as WEATHER NOW. The Rain and the Mist as places are not weather.`,
  flashback: `FLASHBACK: flashback is null unless a FLASHBACK, MEMORY or THIS TURN IS A MEMORY line below says how to set it.`,
};

const SUMMARY_SYSTEM = `You are a story summarizer for a long-running interactive novel.

Write a 100-150 word summary of the supplied scene.
- Second person, present tense: Kan is "you" ("You follow Itachi north"). Everyone else is named only by the name you knew them by at the time, as the scene does; someone you could not name stays described ("the masked man").
- Concrete and specific.
- No meta-text, no commentary, no greeting.
- Mention the most important NPCs, your choices, and the consequences.
- Preserve any timeline information (WHEN AND WHERE gives the dates and the place).
- Keep every promise, debt, secret learned, injury and death, and who knows what.

Reply in exactly this format, nothing else:
TITLE: a 2-6 word name for this stretch of story, no ending punctuation
MEMORY: one or two short sentences (under 40 words), second person, on what you will remember of it
SUMMARY: the 100-150 word summary`;

const ARC_SUMMARY_SYSTEM = `You are a story archivist for a long-running interactive novel.

Combine the supplied chapter summaries into one compact arc summary.
- 120-180 words.
- Second person, present tense: Kan is "you". Everyone else is named only by the names you knew them by, as the summaries do.
- Keep cause and effect clear.
- Preserve names, dates, and major consequences.
- No meta-text.

Reply in exactly this format, nothing else:
TITLE: a 2-6 word name for the arc, no ending punctuation
SUMMARY: the arc summary`;

const TIME_SKIP_SYSTEM = `You are a time-skip narrator for a long-running interactive novel.

Write 100-150 words describing what happened meanwhile during the supplied time skip.
- Second person, present tense: Kan is "you". Everyone else is named only by the names you know them by.
- Focus on your off-screen growth as Kan, NPC changes, and world movement.
- Respect the facts and bonds provided.
- No meta-text.

Reply in exactly this format, nothing else:
TITLE: a 2-6 word name for this stretch of time, no ending punctuation
SUMMARY: the 100-150 word summary`;

export function buildNarrationPrompt(
  db: AppDatabase,
  userMessage: string
) {
  const withCurrent = getRecentMessages(db, db.settings.contextMessages + 1);
  const currentIsLast =
    withCurrent.length > 0 &&
    withCurrent[withCurrent.length - 1].role === 'user' &&
    withCurrent[withCurrent.length - 1].content === userMessage;

  const recentMessages = currentIsLast
    ? withCurrent.slice(0, -1).slice(-db.settings.contextMessages)
    : withCurrent.slice(-db.settings.contextMessages);

  const memories = retrieveMemories(
    db,
    { recentMessages: withCurrent, userMessage },
    db.settings.retrievalLimit
  );
  const entityText = [...recentMessages.map((message) => message.content), userMessage].join('\n');
  // Companions are in every scene, so their character cards always come along.
  // The people actually present, then anyone named: a label ("the masked
  // man") never matches a name in the text.
  const matchedEntityIds = new Set([
    ...companionsOf(db).map((entity) => entity.id),
    ...sceneCastIdsOf(db),
    ...db.entities
      .filter((entity) => mentionsEntity(entityText, entity))
      .map((entity) => entity.id),
  ]);
  const allFacts = relevantFacts(
    db,
    matchedEntityIds,
    entityText,
    new Set([...companionsOf(db).map((entity) => entity.id), ...sceneCastIdsOf(db)])
  );
  // Lore that is always on (the geography) never changes from turn to turn,
  // so it sits in the cached front of the prompt; only triggered lore is per turn.
  const triggered = triggeredLore(db, entityText);
  const alwaysLore = triggered.filter((entry) => entry.always);
  const allLore = triggered.filter((entry) => !entry.always);
  // What the prompt budget cuts first (see the loop at the end): older
  // memories, then the less relevant facts and lore, and only then the
  // oldest lines of the recent scene.
  let facts = allFacts;
  let lore = allLore;
  const storySoFar = getStorySoFar(db);
  const shownSummaries = new Set(
    [storySoFar.arc, ...storySoFar.chapters].filter((text): text is string => Boolean(text))
  );
  // A memory saved from a summary that is already shown would only repeat it.
  let freshMemories = memories.filter(
    (memory) =>
      !shownSummaries.has(memory.summary) &&
      !(memory.summaryId && storySoFar.ids.includes(memory.summaryId))
  );
  const arcSummary = storySoFar.arc ?? storySoFar.chapters[storySoFar.chapters.length - 1] ?? null;
  // A flashback playing now: the narrator gets the memory instead of the present.
  const playing = activeFlashback(db);
  const memoryView = playing ? flashbackView(db) : null;
  const memoryCast = playing
    ? playing.active.castIds.map((id) => db.entities.find((entity) => entity.id === id)?.name).filter((name): name is string => Boolean(name))
    : [];
  // Conversation, fight, or normal narration, from the scene so far and Kan's input.
  const sceneMode = resolveTurnMode(
    playing ? { ...db, state: { ...db.state, sceneCast: memoryCast.length > 0 ? memoryCast : playing.record.cast } } : db,
    userMessage
  );
  // At most one outside pressure per turn: a grudge first, then something
  // coming back, then a bounty hunter, then a familiar face.
  const pressure = playing ? '' : formatPressure(db, entityText);
  // A memory that fits this moment: at most one a month, never in a fight or
  // while something presses in on Kan.
  const memoryOffer = playing || pressure ? null : flashbackOffer(db, userMessage, sceneMode.mode);

  // Ordered from never-changing to changing-every-turn, so the front of the
  // prompt is a stable prefix that providers can cache (cache reads cost a
  // fraction of fresh input).
  // 1. The rules: identical on every turn of every story.
  const rules = NARRATION_SYSTEM;
  // 2. Who Kan is and the long view: changes only when a summary lands, a
  //    jutsu is learned, a thread opens or closes, or a bond moves.
  const slow = [
    formatCharacterSheet(db),
    formatStorySoFar(storySoFar),
    formatJutsu(db),
    formatThreads(db),
    formatBonds(db),
    formatTheDead(db),
  ].filter(Boolean).join('\n\n');

  // 3. Everything that moves turn to turn. Inside a flashback the present
  //    stands still: no news, letters, canon, pressure or present state.
  const buildMemoryDynamic = (messagesForScene: RawLogEntry[]) =>
    [
      formatFlashbackBlock(db, formatWeatherLine(memoryView ?? db, sceneMode.mode)),
      formatMemories(db, freshMemories),
      formatRecentMessages(messagesForScene),
      'CONTINUITY: continue directly from the last narrated beat of the memory. Never repeat a beat you already wrote and never contradict it.',
      // Present wounds don't exist in the memory.
      formatSceneModeLine({ ...db, facts: [] }, sceneMode),
      `YOU (KAN) DO OR SAY:\n${userMessage}`,
    ]
      .filter(Boolean)
      .join('\n\n');

  const buildDynamic = (messagesForScene: RawLogEntry[]) =>
    playing ? buildMemoryDynamic(messagesForScene) : [
      formatState(db),
      formatCompanions(db),
      formatTimeLine(db, 'narrator', sceneMode.mode),
      formatWeatherLine(db, sceneMode.mode),
      formatSafehouseLine(db, userMessage),
      formatMatchedEntities(db, matchedEntityIds, {
        lastNarration: [...messagesForScene].reverse().find((message) => message.role === 'assistant')?.content,
        userMessage,
      }),
      formatFacts(db, facts),
      formatFigures(db),
      formatElsewhere(db),
      formatLore(lore),
      formatNewsBlock(db),
      formatLetterBlock(db),
      formatYearlyBlock(yearlyOffer(db)),
      formatUpcomingWorldBlock(db),
      formatCanonBlock(db),
      formatMemories(db, freshMemories),
      formatRecentMessages(messagesForScene),
      formatVarietyBlock(db),
      formatEncounterConditions(db),
      formatNameOutThere(db),
      formatRenownBlock(db),
      pressure,
      formatFlashbackOffer(db, memoryOffer),
      formatFlashbackReturn(db),
      `CONTINUITY: continue directly from the last narrated beat. Never repeat a beat you already wrote and never contradict it. Location type: ${locationKindOf(db)}.`,
      formatSceneModeLine(db, sceneMode),
      formatTimeSkipLine(db, userMessage, sceneMode.mode === 'fight' || isCombatPace(db.state.scenePace)),
      `YOU (KAN) DO OR SAY:\n${userMessage}`,
    ]
      .filter(Boolean)
      .join('\n\n');

  const assemble = (messagesForScene: RawLogEntry[]): OpenRouterMessage[] => {
    const fixedLore = formatLore(alwaysLore, 'WORLD (fixed reference)');
    const ruleText = localizePlaceNames(fixedLore ? `${rules}\n\n${fixedLore}` : rules);
    const slowText = localizePlaceNames(slow);

    return [
      {
        role: 'system',
        content: `${ruleText}\n\n${slowText}`,
        parts: [
          { text: `${ruleText}\n\n`, cache: true },
          { text: slowText, cache: true },
        ],
      },
      { role: 'user', content: localizePlaceNames(buildDynamic(messagesForScene)) },
    ];
  };

  const budget = db.settings.promptTokenBudget ?? DEFAULT_SETTINGS.promptTokenBudget;
  let sceneMessages = recentMessages;
  let messages = assemble(sceneMessages);
  let estimated = estimateTokens(messages);

  // Prompt budget: cut the least important material first — recalled
  // memories, then the less relevant facts and lore — and the recent scene
  // last, oldest lines first.
  const cuts: (() => boolean)[] = [
    () => (freshMemories.length > 2 ? ((freshMemories = freshMemories.slice(0, 2)), true) : false),
    () => (facts.length > 6 ? ((facts = facts.slice(0, 6)), true) : false),
    () => (lore.length > 2 ? ((lore = lore.slice(0, 2)), true) : false),
    () => (freshMemories.length > 0 ? ((freshMemories = []), true) : false),
    () => (facts.length > 3 ? ((facts = facts.slice(0, 3)), true) : false),
  ];

  for (const cut of cuts) {
    if (estimated <= budget) break;
    if (cut()) {
      messages = assemble(sceneMessages);
      estimated = estimateTokens(messages);
    }
  }

  while (estimated > budget && sceneMessages.length > MIN_SCENE_MESSAGES) {
    sceneMessages = sceneMessages.slice(1);
    messages = assemble(sceneMessages);
    estimated = estimateTokens(messages);
  }

  return {
    messages,
    estimatedTokens: estimated,
    memories: freshMemories,
    recentMessages: sceneMessages,
    arcSummary,
    sceneMode,
    /** The flashback this reply belongs to (stamped on its entries), or the one offered on it. */
    flashback: {
      ...(playing ? { active: { id: playing.active.id, date: playing.active.date } } : {}),
      ...(memoryOffer ? { offerId: memoryOffer.id } : {}),
    },
  };
}

/**
 * Call 2 of a turn: a cheap model reads the narrator's prose and returns the
 * state change as structured JSON (see stateSchema.ts).
 */
/**
 * Keywords that mean this turn may have touched a World area (audit 7). They
 * only decide whether the World call is asked; a false alarm costs one small
 * call, a miss loses that area for the turn, so they are generous.
 */
const WORLD_AREA_WORDS: Partial<Record<WorldArea, RegExp>> = {
  letters: /\b(letters?|scrolls?|messages?|notes?|birds?|hawks?|crows?|ravens?|falcons?|couriers?|messengers?|ninken|summon(ed|s)?|dead[- ]drop|writes?|wrote|written|writing|envelopes?|seals? (it|the)|sends? word|post)\b/i,
  safehouse: /\b(inns?|rooms?|rent(s|ed)?|camps?|hideouts?|bases?|lairs?|caves?|shelters?|sleep(s|ing)?|slept|asleep|beds?|bedrolls?|lodg\w*|teahouses?|ruins?|houses?|homes?|huts?|cabins?|stash(es|ed)?|settles? in|move[sd]? in|stay(s|ed)? the night|for the night|barriers?|traps?|upstairs|key)\b/i,
  enemies: /\b(bount(y|ies)|bingo|wanted|rewards?|hunters?|hunter-nin|grudges?|revenge|avenge\w*|spar(e|es|ed)|mercy|li(e|es|ed)|lying|betray\w*|witness\w*|promis\w*|swear|swore|sworn|owe[sd]?|debts?|kill(s|ed)?|fight|fought|attack\w*|struck|strikes?|humiliat\w*|forgiv\w*|they call you|known as|called you|your name|reputation|rumou?rs?|feared|legend)\b/i,
  lives: /\b(birthdays?|born|promot\w*|j[oō]nin|ch[uū]nin|married|marry|wedding|engaged|pregnan\w*|baby|moved|new team|retired|appointed|became|kage|hokage|hospital|graduat\w*|apprentic\w*|since you left|these days|nowadays)\b/i,
  abilities: /\b(natures?|affinit(y|ies)|elements?|sharingan|tomoe|mangeky[oō]|susan[oō]o|rinnegan|thousand souls|awaken\w*|kekkei|chakra paper|your eyes?)\b/i,
  weather: /\b(rain\w*|drizzle|downpour|snow\w*|sleet|hail|fog\w*|mist\w*|storm\w*|thunder\w*|sun(light|shine)?|clouds?|cloudy|overcast|clear sky|winds?|gale|blizzard|frost|heat|humid|weather)\b/i,
};

/**
 * Which World areas this turn calls for: an offer the narrator prompt made in
 * that area this turn, or the turn's words reaching it. Inside a flashback only
 * the memory's own marks (and its weather) are asked.
 */
export function worldAreasForTurn(db: AppDatabase, userMessage: string, assistantMessage: string): WorldArea[] {
  const text = `${userMessage}\n${assistantMessage}`;
  const reply = [...db.rawLog].reverse().find((entry) => entry.role === 'assistant' && entry.content === assistantMessage);
  const words = (area: WorldArea) => WORLD_AREA_WORDS[area]?.test(text) ?? false;
  const areas = new Set<WorldArea>();

  if (flashbackTrackingLines(db, reply?.flashbackOffer).length > 0) areas.add('flashback');
  if (words('weather')) areas.add('weather');

  if (activeFlashback(db)) {
    return WORLD_AREAS.filter((area) => areas.has(area));
  }

  if (turnLetterOffer(db) || words('letters')) areas.add('letters');
  if (currentSafehouse(db) || words('safehouse')) areas.add('safehouse');
  if (
    grudgeOffer(db) ||
    turnConsequenceOffer(db) ||
    hunterOffer(db) ||
    reply?.sceneMode === 'fight' ||
    words('enemies')
  ) {
    areas.add('enemies');
  }
  if (yearlyOffer(db) || words('lives') || words('letters')) areas.add('lives');
  if (words('abilities')) areas.add('abilities');
  if (formatCanonTracking(db)) areas.add('canon');

  return WORLD_AREAS.filter((area) => areas.has(area));
}

export function buildExtractionPrompt(
  db: AppDatabase,
  userMessage: string,
  assistantMessage: string
) {
  const previousBeat = [...getRecentMessages(db, 6)]
    .reverse()
    .find((message) => message.role === 'assistant' && message.content !== assistantMessage);

  // The roster both calls share, in the cached front.
  const stable = [
    formatCharacterRoster(db),
    formatJutsu(db),
    formatBonds(db),
    formatThreads(db),
  ].join('\n\n');

  const reply = [...db.rawLog].reverse().find((entry) => entry.role === 'assistant' && entry.content === assistantMessage);
  // A turn inside a flashback: the memory's clock and place, and none of the
  // present's canon, letters or enemies to mark.
  const memoryView = activeFlashback(db) ? flashbackView(db) : null;
  const flashbackLines = flashbackTrackingLines(db, reply?.flashbackOffer);
  const stateLine = memoryView
    ? `CURRENT STATE (inside the memory)\nDate: ${formatDate(memoryView.state.inStoryDate)}\nLocation: ${truncate(memoryView.state.location, 100)}`
    : formatState(db);
  const characterDetails = formatCharacterDetails(db, `${userMessage}\n${assistantMessage}`);
  const theDay = memoryView ? '' : formatYearlyTracking(db);
  const thisTurn = [
    previousBeat
      ? `PREVIOUS BEAT (context only — already recorded)\n${tail(stripNarrationJson(previousBeat.content), 500)}`
      : '',
    'THIS TURN',
    `You (Kan): ${userMessage}`,
    `Narrator: ${assistantMessage}`,
  ];

  const dynamic = [
    // Facts move every turn, so they sit outside the cached part, with refs
    // the tracker can end or replace.
    memoryView ? '' : formatFacts(db, stateFacts(db, `${userMessage}\n${assistantMessage}`), { refs: true }),
    stateLine,
    memoryView ? '' : formatCompanionIds(db),
    characterDetails,
    formatTimeLine(memoryView ?? db, 'state'),
    formatSceneModeTracking(null, reply?.sceneMode),
    // Inside a memory its line tells both trackers what to leave empty.
    ...(memoryView ? flashbackLines : []),
    // Today's birthday also moves bonds, which are Core's.
    theDay,
    ...thisTurn,
    'Report the state change for THIS TURN now.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `${STATE_SYSTEM}\n\n${stable}`,
      parts: [{ text: `${STATE_SYSTEM}\n\n`, cache: true }, { text: stable }],
    },
    { role: 'user', content: dynamic },
  ];

  const areas = worldAreasForTurn(db, userMessage, assistantMessage);
  const has = (area: WorldArea) => areas.includes(area);
  const worldDynamic = [
    `THIS CALL: ${areas.join(', ')}`,
    ...areas.map((area) => WORLD_AREA_RULES[area]),
    stateLine,
    characterDetails,
    has('abilities') ? `YOUR ABILITIES\n${formatAbilities(db)}` : '',
    has('weather') ? formatWeatherTracking(memoryView ?? db) : '',
    has('flashback') ? flashbackLines.join('\n') : '',
    has('canon') ? formatCanonTracking(db) : '',
    has('letters') ? formatLetterTracking(db) : '',
    has('safehouse') ? formatSafehouseTracking(db) : '',
    has('lives') ? theDay : '',
    has('enemies') ? formatEnemyTracking(db) : '',
    ...thisTurn,
    'Report these areas for THIS TURN now.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const world =
    areas.length > 0
      ? {
          areas,
          messages: [
            {
              role: 'system',
              content: `${WORLD_STATE_SYSTEM}\n\n${stable}`,
              parts: [{ text: `${WORLD_STATE_SYSTEM}\n\n`, cache: true }, { text: stable }],
            },
            { role: 'user', content: worldDynamic },
          ] as OpenRouterMessage[],
        }
      : null;

  return {
    messages,
    world,
    estimatedTokens: estimateTokens(messages) + (world ? estimateTokens(world.messages) : 0),
  };
}

export function buildSceneSummaryPrompt(
  db: AppDatabase,
  messages: RawLogEntry[],
  options: { memoryNote?: string } = {}
) {
  // Each message keeps its opening and its ending: the outcome is at the end (audit 6.5).
  const transcript = messages
    .map(
      (message) =>
        `${message.role === 'user' ? 'You (Kan)' : 'Narrator'}: ${headAndTail(message.content, 1400)}`
    )
    .join('\n\n');
  const first = messages[0]?.inStoryDate;
  const last = messages[messages.length - 1]?.inStoryDate;
  const when =
    first && last
      ? `WHEN AND WHERE: ${formatDate(first)}${formatDate(first) === formatDate(last) ? '' : ` to ${formatDate(last)}`}${messages[0]?.scene ? `; scene: ${messages[0].scene}` : ''}; you are now at ${db.state.location}.`
      : '';

  const system = [
    SUMMARY_SYSTEM,
    formatState(db),
    formatBonds(db),
  ].join('\n\n');

  // The people it mattered to most also get their own side of it.
  const pov = povInstruction(povCandidates(db, messages), (entity) => displayName(db, entity));
  const memory = options.memoryNote ? `${options.memoryNote}\n\n` : '';
  const user = `${memory}${when ? `${when}\n\n` : ''}SCENE TRANSCRIPT:\n${transcript}\n\n${pov ? `${pov}\n\n` : ''}Write the summary now.`;
  const promptMessages: OpenRouterMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  return {
    messages: promptMessages,
    estimatedTokens: estimateTokens(promptMessages),
  };
}

const SAGA_SYSTEM = `You are a story archivist for a long-running interactive novel that spans many years.

Keep one rolling summary of the whole story so far: fold the new arc into the saga you are given.
- 250 words at most. The older the events, the shorter they get; never drop a death, a betrayal, a promise still open, a debt, a secret learned, or who knows what.
- Keep the order of events and the years they happened in.
- Second person, present tense: Kan is "you". Everyone else is named only by the names you knew them by.
- No meta-text.

Reply in exactly this format, nothing else:
TITLE: The story so far
SUMMARY: the saga`;

/** Folds a new arc summary into the rolling saga (audit 6.5). */
export function buildSagaPrompt(db: AppDatabase, saga: string | null, arc: string) {
  const user = `${saga ? `THE SAGA SO FAR:\n${saga}` : 'THE SAGA SO FAR:\n(none yet: this is the first arc)'}\n\nNEW ARC:\n${arc}\n\nWrite the updated saga now.`;
  const promptMessages: OpenRouterMessage[] = [
    { role: 'system', content: [SAGA_SYSTEM, `Today: ${formatDate(db.state.inStoryDate)}.`].join('\n\n') },
    { role: 'user', content: user },
  ];

  return { messages: promptMessages, estimatedTokens: estimateTokens(promptMessages) };
}

export function buildArcSummaryPrompt(
  db: AppDatabase,
  summaries: string[]
) {
  const system = [
    ARC_SUMMARY_SYSTEM,
    formatState(db),
  ].join('\n\n');

  const user = `CHAPTER SUMMARIES:\n${summaries.map((summary, index) => `${index + 1}. ${summary}`).join('\n')}\n\nWrite the arc summary now.`;
  const promptMessages: OpenRouterMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  return {
    messages: promptMessages,
    estimatedTokens: estimateTokens(promptMessages),
  };
}

export function buildTimeSkipPrompt(
  db: AppDatabase,
  from: string,
  to: string
) {
  const system = [
    TIME_SKIP_SYSTEM,
    formatState(db),
    formatBonds(db),
    formatFacts(db, db.facts.filter((fact) => fact.validTo === null).slice(0, 10)),
  ].join('\n\n');

  const user = `TIME SKIP:\nFrom ${from}\nTo ${to}\n\nWrite the "meanwhile" summary now.`;
  const promptMessages: OpenRouterMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  return {
    messages: promptMessages,
    estimatedTokens: estimateTokens(promptMessages),
  };
}

export function getRecentMessages(db: AppDatabase, limit: number): RawLogEntry[] {
  // Inside a flashback: the present lead-in and this memory's turns. Back in
  // the present: memories stay out, so the story picks up where Kan left it.
  const playing = activeFlashback(db)?.active.id;

  return db.rawLog
    .filter((message) => message.kind === 'story' && (!message.flashback || message.flashback.id === playing))
    .slice(-limit);
}

type StorySoFar = {
  /** The rolling summary of the whole story (one, folded from every arc). */
  saga: string | null;
  arc: string | null;
  /** Newest chapter summaries, oldest first. */
  chapters: string[];
  /** Ids of the summaries shown. */
  ids: string[];
};

/**
 * The latest arc summary plus the last few chapter summaries. Chapters the arc
 * already covers are skipped, unless that would leave fewer than two.
 */
function getStorySoFar(db: AppDatabase): StorySoFar {
  const byAge = (a: { createdAt: number }, b: { createdAt: number }) => a.createdAt - b.createdAt;
  const arc = db.summaries.filter((summary) => summary.level === 'arc').sort(byAge).pop() ?? null;
  const chapters = db.summaries.filter((summary) => summary.level === 'chapter').sort(byAge);
  const covered = new Set(arc?.sourceSummaryIds ?? []);
  let picked = chapters.filter((summary) => !covered.has(summary.id)).slice(-STORY_CHAPTERS);

  if (picked.length < 2) {
    picked = chapters.slice(-2);
  }

  const saga = db.summaries.filter((summary) => summary.level === 'saga').sort(byAge).pop() ?? null;

  return {
    saga: saga?.text ?? null,
    arc: arc?.text ?? null,
    chapters: picked.map((summary) => summary.text),
    ids: [...(saga ? [saga.id] : []), ...(arc ? [arc.id] : []), ...picked.map((summary) => summary.id)],
  };
}

function formatStorySoFar(story: StorySoFar) {
  if (!story.saga && !story.arc && story.chapters.length === 0) {
    return 'STORY SO FAR\nThe story is just beginning.';
  }

  return [
    'STORY SO FAR',
    story.saga ? `The whole story: ${truncate(story.saga, 1800)}` : '',
    story.arc ? `Latest arc: ${truncate(story.arc, 1200)}` : '',
    ...story.chapters.map((text, index) =>
      `${index === story.chapters.length - 1 ? 'Latest chapter' : 'Chapter'}: ${truncate(text, 1000)}`
    ),
  ]
    .filter(Boolean)
    .join('\n');
}

function formatCharacterSheet(db: AppDatabase) {
  const player = db.state.player;

  return [
    'PLAYER CHARACTER',
    `Name: ${player.name}`,
    `Lineage: ${player.lineage.join(', ')}`,
    `Birthday: month ${player.birthday.month}, day ${player.birthday.day}`,
    `Birth year: ${player.birthYear}`,
    `Age: ${calculateAge(db.state.inStoryDate, player.birthday, player.birthYear)}`,
    `Rank/Role: ${player.rank} / ${player.role}`,
    `Former team (Team 3, left on joining ANBU at 12): ${player.team.join(', ')}`,
    `Former sensei: ${player.sensei}`,
    `Personality: ${player.personality.join(', ')}`,
    formatAbilities(db),
    player.secretNotes.length > 0
      ? `Secret notes: ${player.secretNotes.join(' | ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function formatState(db: AppDatabase) {
  const state = db.state;

  return [
    'CURRENT STATE',
    `Date: ${formatDate(state.inStoryDate)}`,
    `Location: ${truncate(state.location, 100)}`,
    `Kan's mood: ${truncate(state.mood, 60)}`,
    `World: ${truncate(state.worldDescription, 220)}`,
    `Jutsu: ${truncate(state.jutsu.slice(-10).join(', '), 240) || 'none'}`,
    `Inventory: ${truncate(state.inventory.join(', '), 700) || 'none'}`,
    formatPurseLine(db),
    `Canon point: ${truncate(state.canonPoint, 220)}`,
    `Chapter: ${state.chapter}${state.chapterTitle ? ` (${state.chapterTitle})` : ''}`,
    `Scene: ${truncate(state.scene, 140)}`,
    placesLine(db),
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Who travels with Kan, for the narrator: they are in every scene. Changes
 * only by the day count, so it sits right after the state block.
 */
function formatCompanions(db: AppDatabase) {
  const companions = companionsOf(db);

  if (companions.length === 0) {
    return '';
  }

  const bonds = new Map(db.bonds.map((bond) => [bond.entityId, bond]));

  return [
    'TRAVELLING WITH KAN (at his side in every scene until the story shows them leave)',
    ...companions.map((entity) => {
      const bond = bonds.get(entity.id);
      const companion = entity.companion!;
      const days = daysTogether(db, entity);
      const together = days <= 0 ? 'joined today' : `together ${formatTogether(days)}`;
      const how = [companion.reason, companion.sinceLocation ? `from ${companion.sinceLocation}` : null]
        .filter(Boolean)
        .join(', ');
      const feeling = bond
        ? `; feels ${bond.affinity > 0 ? '+' : ''}${bond.affinity}/10 toward Kan${bond.relationship && bond.relationship !== 'stranger' ? ` (${bond.relationship})` : ''}${bond.note ? `: ${truncate(bond.note, 70)}` : ''}`
        : '';

      return `- ${narratorName(db, entity)}: ${together}${how ? ` (${truncate(how, 80)})` : ''}, ${companion.sharedScenes} scene${companion.sharedScenes === 1 ? '' : 's'} shared${feeling}`;
    }),
  ].join('\n');
}

/** The same, for the state tracker: ids it must keep in characters_present. */
function formatCompanionIds(db: AppDatabase) {
  const companions = companionsOf(db);
  const refByEntity = refByEntityId(db);

  return `TRAVELLING WITH KAN: ${
    companions.length > 0
      ? companions.map((entity) => `${refByEntity.get(entity.id)} (${entity.name})`).join(', ')
      : 'nobody'
  }`;
}

/** The scene cast as entity ids. */
function sceneCastIdsOf(db: AppDatabase): string[] {
  return (db.state.sceneCast ?? [])
    .map((name) => resolveEntity(db, name)?.id)
    .filter((id): id is string => Boolean(id));
}

function formatMatchedEntities(
  db: AppDatabase,
  entityIds: Set<string>,
  turnText: { lastNarration?: string; userMessage?: string } = {}
) {
  if (entityIds.size === 0) {
    return '';
  }

  const present = sceneCastIdsOf(db);
  const presentSet = new Set(present);
  const nowText = `${turnText.lastNarration ?? ''}\n${turnText.userMessage ?? ''}`;
  // Who matters most this turn (audit 6.1): companions, the people actually
  // here, people named in the last reply or in Kan's input, then everyone
  // else by how recently Kan saw them.
  const rank = (entity: EntityRecord) =>
    entity.companion ? 0 : presentSet.has(entity.id) ? 1 : mentionsEntity(nowText, entity) ? 2 : 3;
  const seenKey = (entity: EntityRecord) => (entity.lastSeen ? dateSortValue(entity.lastSeen) : 0);
  const ranked = db.entities
    .filter(
      (entity) =>
        entity.type === 'character' &&
        entityIds.has(entity.id) &&
        entity.name.toLowerCase() !== 'kan'
    )
    .sort((a, b) => rank(a) - rank(b) || seenKey(b) - seenKey(a));
  const characters = ranked.slice(0, FULL_CARD_LIMIT);
  // Anyone else in the room still gets a line: name Kan knows, role, mood, feeling.
  const extras = ranked.slice(FULL_CARD_LIMIT).filter((entity) => entity.companion || presentSet.has(entity.id));

  if (characters.length === 0) {
    return '';
  }

  // Someone Kan meets again after a long time; how each remembers him.
  const reunions = reunionNotes(db, characters);
  const remembers = (entity: EntityRecord) => {
    const pov = latestPov(db, entity.id);

    return pov ? `; remembers of you: "${truncate(pov, 120)}"` : '';
  };

  const bondsByEntity = new Map(db.bonds.map((bond) => [bond.entityId, bond]));
  const feeling = (entity: EntityRecord) => {
    const bond = bondsByEntity.get(entity.id);
    return bond ? `\n  ${formatBondLine(db, bond)}` : '';
  };
  const known = (entity: EntityRecord) => {
    const other = kanKnowsName(entity) ? alsoKnownAs(db, entity)[0] : undefined;
    const card = kanKnowsName(entity) ? displayName(db, entity) : `${labelOf(db, entity)} [narrator only: ${entity.name}]`;

    return `${card}${other ? ` (also called ${other})` : ''}`;
  };
  const truth = (entity: EntityRecord) => {
    const line = identityLine(db, entity, present.includes(entity.id) ? present : [...present, entity.id]);

    return `\n  ${kanKnowsLine(db, entity)}.${line ? `\n${line}` : ''}`;
  };

  // In a fight, anyone canon still needs is told to come out of it alive.
  const fighting = isCombatPace(db.state.scenePace) || db.state.sceneMode?.current === 'fight';
  const survives = (entity: EntityRecord) => {
    if (!fighting || isDeceased(entity) || !present.includes(entity.id)) {
      return '';
    }

    const ahead = canonRoleAhead(db, entity);
    return ahead ? `\n  ${canonSurvivalLine(ahead)}` : '';
  };

  return [
    'CHARACTERS IN SCENE',
    ...characters.map(
      (entity) =>
        `- ${known(entity)}${entity.role ? ` (${truncate(entity.role, 40)})` : ''}${isReanimated(entity) ? ` [REANIMATED: dead, here through Edo Tensei; ${REANIMATED_LOOK}]` : isDeceased(entity) ? ` [DECEASED${kanKnowsDeath(db, entity) ? '' : ', Kan does not know yet'}]` : ''}: personality ${truncate(entity.personality ?? 'unknown', 60)}; speech ${truncate(entity.speechStyle ?? 'unknown', 50)}; mood ${truncate(entity.mood ?? 'unknown', 60)}; appearance ${truncate(entity.appearance ?? 'unknown', 80)}${entity.currentLook ? `; right now: ${truncate(entity.currentLook, 90)}` : ''}${formatLoreProfile(db, entity.name)}${remembers(entity)}${truth(entity)}${reunions.has(entity.id) ? `\n  ${reunions.get(entity.id)}` : ''}${feeling(entity)}${survives(entity)}`
    ),
    ...(extras.length > 0
      ? [
          'ALSO HERE',
          ...extras.map((entity) => {
            const bond = bondsByEntity.get(entity.id);
            return `- ${known(entity)}${entity.role ? ` (${truncate(entity.role, 40)})` : ''}; mood ${truncate(entity.mood ?? 'unknown', 40)}${bond ? `; ${bond.affinity}/10 toward you, ${bond.relationship ?? 'stranger'}` : ''}${survives(entity)}`;
          }),
        ]
      : []),
  ].join('\n');
}

/**
 * Everyone the state tracker can refer to, by ID. Stable from turn to turn
 * (it only changes when someone is added, merged or renamed), so it sits in
 * the cached part of the prompt.
 */
/**
 * People in the background: never met, and long dead before the story (no
 * date of death), sealed, or a summoned animal. They stay out of the roster
 * to keep it short; when a turn names them they are listed with their id
 * under CHARACTERS IN THIS TURN. Anyone who dies during the story stays.
 */
function inBackground(entity: EntityRecord) {
  const longDead = isDeceased(entity) && !entity.deceased?.date && !entity.deceased?.canonEventId;

  return (
    entity.met === false &&
    !entity.companion &&
    (longDead || entity.status === 'Sealed' || entity.tags.includes('summon') || entity.tags.includes('tailed-beast'))
  );
}

function formatCharacterRoster(db: AppDatabase) {
  const refs = [...characterRefs(db)].filter(([, entity]) => !inBackground(entity));

  if (refs.length === 0) {
    return 'KNOWN CHARACTERS\nNone.';
  }

  return [
    'KNOWN CHARACTERS (id: name, other names) — refer to people by id; anyone listed here or under CHARACTERS IN THIS TURN already exists',
    ...refs.map(([ref, entity]) => {
      const others = entity.aliases.filter((alias) => alias.toLowerCase() !== entity.name.toLowerCase()).slice(0, 4);
      const notes = [
        entity.name.toLowerCase() === 'kan' ? 'the player' : null,
        entity.met === false ? 'not met yet' : null,
        entity.companion && !isDeceased(entity) ? 'travelling with Kan' : null,
        isDeceased(entity) ? (kanKnowsDeath(db, entity) ? 'deceased' : 'deceased, Kan does not know yet') : null,
      ].filter(Boolean);

      // People with more than one identity: the tracker sees them all.
      const identities = identitiesOf(entity);
      const truth = identities.length > 1 ? `; identities: ${identities.map((identity) => `${identity.name} (${identity.kind})`).join(', ')}` : '';

      return `- ${ref}: ${entity.name}${others.length > 0 ? ` (${others.join(', ')})` : ''}${notes.length > 0 ? ` [${notes.join(', ')}]` : ''}${truth}`;
    }),
  ].join('\n');
}

/**
 * Details for the people this turn is about: Kan, the current scene cast,
 * and anyone named in the turn.
 */
function formatCharacterDetails(db: AppDatabase, turnText: string) {
  const refByEntity = refByEntityId(db);
  const cast = new Set((db.state.sceneCast ?? []).map((name) => name.toLowerCase()));
  const mentioned = (entity: EntityRecord) =>
    [entity.name, ...entity.aliases].some((name) => cast.has(name.toLowerCase())) ||
    mentionsEntity(turnText, entity);

  const characters = db.entities
    .filter((entity) => entity.type === 'character')
    .filter((entity) => entity.name.toLowerCase() === 'kan' || Boolean(entity.companion) || mentioned(entity))
    .slice(0, 10);

  if (characters.length === 0) {
    return '';
  }

  return [
    'CHARACTERS IN THIS TURN',
    ...characters.map((entity) => {
      const age = entityAge(db.state.inStoryDate, entity);
      const role = truncate(entity.role ?? '', 40);

      if (isDeceased(entity)) {
        return `- ${refByEntity.get(entity.id)}: ${entity.name}, DECEASED${kanKnowsDeath(db, entity) ? '' : ' (Kan does not know yet)'}`;
      }

      const name = entity.name.toLowerCase() === 'kan' ? '' : `; ${kanKnowsName(entity) ? `you know them as ${displayName(db, entity)}` : `you don't know their name (you see "${labelOf(db, entity)}")`}`;

      return `- ${refByEntity.get(entity.id)}: ${entity.name}${age !== undefined ? `, age ${age}` : ''}${role ? `, ${role}` : ''}${entity.companion ? ' [travelling with Kan]' : ''}${name}; mood ${truncate(entity.mood ?? 'unknown', 60)}; base look ${truncate(entity.appearance ?? 'unknown', 80)}${entity.currentLook ? `; right now: ${truncate(entity.currentLook, 80)}` : ''}`;
    }),
  ].join('\n');
}

/** Most of Kan's own jutsu the narrator sees, one line each. */
const KAN_JUTSU_LIMIT = 20;
/** Jutsu per other person in the scene. */
const SCENE_JUTSU_PER_PERSON = 3;

/**
 * Kan's own jutsu first, all of them up to 20, whatever their nature (his
 * genjutsu, taijutsu and space-time techniques too); then up to 3 each for
 * the people in the scene. Nobody else's.
 */
function formatJutsu(db: AppDatabase) {
  const isKan = (user: string) => user.trim().toLowerCase() === 'kan';
  const used = (a: JutsuRecord, b: JutsuRecord) =>
    Number(b.tags.includes('signature')) - Number(a.tags.includes('signature')) || b.timesUsed - a.timesUsed;
  const own = db.jutsuRecords.filter((record) => isKan(record.user)).sort(used).slice(0, KAN_JUTSU_LIMIT);

  const people = new Map(db.entities.map((entity) => [entity.id, entity]));
  const present = sceneCastIdsOf(db)
    .map((id) => people.get(id))
    .filter((entity): entity is EntityRecord => Boolean(entity) && entity!.name.toLowerCase() !== 'kan');
  const theirs = present.flatMap((entity) => {
    const records = db.jutsuRecords
      .filter((record) => !isKan(record.user) && resolveEntity(db, record.user)?.id === entity.id)
      .sort(used)
      .slice(0, SCENE_JUTSU_PER_PERSON);

    return records.length > 0
      ? [
          `${narratorName(db, entity)}:`,
          ...records.map((record) => `  - ${record.name}: ${truncate(record.effect, 80)}`),
        ]
      : [];
  });

  if (own.length === 0 && theirs.length === 0) {
    return 'KNOWN JUTSU\nNone.';
  }

  return [
    'KAN’S JUTSU',
    ...(own.length > 0
      ? own.map(
          (record) =>
            `  - ${record.name}${record.tags.includes('signature') ? ' (signature)' : ''} [${normalizeJutsuNature(record.chakraNature)}]: ${truncate(record.effect, 90)}; used ${record.timesUsed}×`
        )
      : ['  None yet.']),
    ...(theirs.length > 0 ? ['JUTSU OF PEOPLE IN THE SCENE', ...theirs] : []),
  ].join('\n');
}

function formatBonds(db: AppDatabase) {
  const deadLabel = new Map(
    db.entities
      .filter(isDeceased)
      .map((entity) => [entity.id, kanKnowsDeath(db, entity) ? ' [deceased]' : ' [deceased, Kan does not know yet]'])
  );
  const people = new Map(db.entities.map((entity) => [entity.id, entity]));
  // The name Kan knows them by, never the record's own name.
  const bondName = (bond: BondRecord) => {
    const entity = people.get(bond.entityId);

    return entity ? narratorName(db, entity) : bond.characterName;
  };
  // Who matters most, love or hate alike (audit 6.2): major bonds, then the
  // strongest feelings either way, then the most recently touched. Enemies
  // are no longer cut for being negative. The list stays the same whoever is
  // in the scene, so this cached block doesn't change every time someone
  // walks in; the people in the scene get their bond on their own card too.
  const bonds = [...db.bonds]
    .filter((bond) => bond.isMajor || Math.abs(bond.affinity) >= 4 || bond.grudge)
    .sort(
      (a, b) =>
        Number(b.isMajor) - Number(a.isMajor) ||
        Math.abs(b.affinity) - Math.abs(a.affinity) ||
        dateSortValue(b.updatedInStoryDate) - dateSortValue(a.updatedInStoryDate)
    )
    .slice(0, 10);

  if (bonds.length === 0) {
    return 'BONDS\nNone yet.';
  }

  return [
    'BONDS',
    ...bonds.map((bond) => `- ${bondName(bond)}${deadLabel.get(bond.entityId) ?? ''} ${formatBondLine(db, bond)}`),
  ].join('\n');
}

/** How a bond reads to the narrator: feeling both ways, relationship, status, notes, grudge stage. */
function formatBondLine(db: AppDatabase, bond: BondRecord) {
  return `(they feel ${bond.affinity}/10 toward you; you feel ${bond.yourFeelings?.affinity ?? bond.affinity}/10 toward them): ${truncate(bond.status ?? 'unknown', 50)}. ${truncate(bond.note, 80)}${bond.yourFeelings?.note ? ` You: ${truncate(bond.yourFeelings.note, 60)}` : ''}${bond.relationship ? ` [relationship: ${bond.relationship}${bond.attraction && bond.attraction !== 'none' ? `, attraction: ${bond.attraction}` : ''}]` : ''}${bond.grudge ? ` [grudge: ${grudgeStage(db, bond)}, ${truncate(bond.grudge.reason, 60)}]` : ''}`;
}

/**
 * Everyone who has died, always in the prompt, so no one comes back because
 * their death fact missed the 10-fact cut. Changes only when someone dies or
 * Kan learns of a death, so it sits in the cached part of the prompt.
 */
function formatTheDead(db: AppDatabase) {
  const dead = db.entities.filter(
    (entity) => entity.type === 'character' && entity.name.toLowerCase() !== 'kan' && isDeceased(entity)
  );

  if (dead.length === 0) {
    return '';
  }

  return [
    'THE DEAD',
    ...dead.map((entity) => {
      const cause = entity.deceased?.cause ? `: ${truncate(entity.deceased.cause, 60)}` : '';

      // Someone Kan never met nor heard of has no label worth giving: the name stays the narrator's.
      const name =
        kanKnowsName(entity) || entity.met !== false ? narratorName(db, entity) : `${entity.name} (unknown to Kan)`;

      return `- ${name}${cause}${kanKnowsDeath(db, entity) ? '' : ' (Kan does not know yet)'}${isReanimated(entity) ? ' (walking again through Edo Tensei)' : ''}`;
    }),
  ].join('\n');
}

function formatFacts(db: AppDatabase, facts: FactRecord[], options: { refs?: boolean } = {}) {
  const active = facts.filter((fact) => fact.validTo === null);

  if (active.length === 0) {
    return 'PERMANENT FACTS\nNone.';
  }

  return [
    options.refs ? 'ACTIVE FACTS (ref: fact) — end or replace by ref' : 'PERMANENT FACTS',
    ...active.map((fact) => {
      const knowers = knowerNames(db, fact);
      const claim =
        fact.confidence === 'claimed'
          ? ` [claimed by ${db.entities.find((entity) => entity.id === fact.claimedBy)?.name ?? 'someone'}]`
          : '';
      const temporary = fact.untilRest ? ' [until rest]' : fact.expiresAt ? ' [temporary]' : '';

      return `- ${options.refs ? `${factRef(fact)}: ` : ''}${truncate(fact.text, 100)}${claim}${temporary}${knowers.length > 0 ? ` (known by: ${truncate(knowers.join(', '), 40)})` : ''}`;
    }),
  ].join('\n');
}

/** Facts the state tracker sees: the ones about people in this turn first, then the newest. */
function stateFacts(db: AppDatabase, turnText: string) {
  const active = db.facts.filter((fact) => fact.validTo === null);
  const here = new Set(
    db.entities
      .filter((entity) => entity.type === 'character' && mentionsEntity(turnText, entity))
      .map((entity) => entity.id)
  );
  const about = active.filter((fact) => fact.subjectEntityId && here.has(fact.subjectEntityId));
  const newest = [...active].reverse();

  return uniqueById([...about, ...newest]).slice(0, 14);
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

/**
 * Open threads, ranked (audit 6.4): those involving someone in the scene,
 * then the most important, then the newest. A years-old promise no longer
 * falls off the list just because newer, smaller threads opened.
 */
function formatThreads(db: AppDatabase) {
  const scene = new Set([...companionsOf(db).map((entity) => entity.id), ...sceneCastIdsOf(db)]);
  const involvesScene = (thread: ThreadRecord) => (thread.participantIds ?? []).some((id) => scene.has(id));
  const threads = db.threads
    .filter((thread) => thread.status === 'open')
    .sort(
      (a, b) =>
        Number(involvesScene(b)) - Number(involvesScene(a)) ||
        (b.importance ?? 3) - (a.importance ?? 3) ||
        (b.openedAt ? dateKey(b.openedAt) : 0) - (a.openedAt ? dateKey(a.openedAt) : 0)
    )
    .slice(0, 8);

  if (threads.length === 0) {
    return 'OPEN THREADS\nNone.';
  }

  return [
    'OPEN THREADS',
    ...threads.map((thread) => `- ${truncate(thread.title, 60)}: ${truncate(thread.description, 80)}`),
  ].join('\n');
}

function dateKey(date: { year: number; month: number; day: number }) {
  return date.year * 10000 + date.month * 100 + date.day;
}

/** The geography is the narrator's whole map and travel table: it is never cut short. */
function loreLimit(entry: AppDatabase['loreEntries'][number]) {
  if (entry.text.startsWith('GEOGRAPHY (fixed')) return 3600;

  return entry.always ? 1400 : 600;
}

function formatLore(lore: AppDatabase['loreEntries'], heading = 'RELEVANT LORE') {
  if (lore.length === 0) {
    return '';
  }

  return [
    heading,
    ...lore.map((entry) => `- ${truncate(entry.text, loreLimit(entry))}`),
  ].join('\n');
}

function formatUpcomingWorldBlock(db: AppDatabase) {
  if (isCombatPace(db.state.scenePace)) {
    return '';
  }

  const upcoming = upcomingWorldMilestones(db, 10);

  if (upcoming.length === 0) {
    return '';
  }

  const lines = [
    "RUMORS OF WHAT'S COMING (planned, NOT yet happened). The world is preparing; NPCs may mention preparations or rumors, never that it happened.",
  ];

  for (const item of upcoming) {
    lines.push(`- ${item.milestone.title}: about ${item.daysUntil} day(s) away (${eraTitle(item.milestone.era)}).`);
  }

  return lines.join('\n');
}

function formatNewsBlock(db: AppDatabase) {
  // No news mid-fight; one piece per turn, or one catch-up report.
  const offer = newsOffer(db);
  const block = formatNewsOffer(offer);
  const item = offer?.mode === 'single' ? offer.items[0] : null;

  // Public news from far away arrives second-hand, and grows on the road.
  if (block && item && item.knowledge === 'public') {
    const here = regionOf(db.state.location) ?? regionOf(db.state.scene);
    const there = regionOf(`${item.location} ${item.region}`);

    if (here && there && travelDaysBetween(here, there) >= 3) {
      return `${block}\n- It happened far from here: if a stranger, a merchant or gossip tells it, it comes garbled by distance (the core is true, the details have grown).`;
    }
  }

  return block;
}

/** YOUR NAME OUT THERE, with what strangers here call Kan. */
function formatNameOutThere(db: AppDatabase) {
  const block = formatReputationBlock(db);
  const extra = epithetLines(db).map((line) => `- ${line}`);

  if (extra.length === 0) return block;

  return block ? `${block}\n${extra.join('\n')}` : ['YOUR NAME OUT THERE (how strangers react to you)', ...extra].join('\n');
}

function formatLetterBlock(db: AppDatabase) {
  const offer = turnLetterOffer(db);
  const address = offer ? letterAddress(db, offer.entity.id) : null;

  return formatLetterOffer(offer, address ? address.name : undefined, offer ? narratorName(db, offer.entity) : undefined);
}

function formatCanonBlock(db: AppDatabase) {
  const active = activeCanonMilestones(db).slice(0, 2);
  const upcoming = upcomingCanonMilestones(db, PERSONAL_OFFERS_PER_TURN);
  const concluded = recentlyConcludedMilestones(db, 3);
  const recent = recentCanonEvents(db, 6).filter((event) => hasHeardNews(db, event.id)).slice(0, 3);
  const lines: string[] = ['CANON TIMELINE'];

  if (recent.length > 0) {
    lines.push(
      ...recent.map(
        (event) =>
          `- World event (${formatDate(event.inStoryDate)}): ${truncate(event.summary, 110)}`
      )
    );
  } else {
    lines.push('- No world events recorded yet; the world is quiet.');
  }

  for (const beat of upcoming) {
    lines.push(
      `PERSONAL STORY BEAT — do not assume it happened (era ${eraTitle(beat.era)}): ${truncate(beat.title, 70)} — ${truncate(beat.description, 130)}`
    );
    lines.push(
      '  This only occurs if Kan actually does it in the scene. Never state it has happened because time passed.'
    );
  }

  if (active.length > 0) {
    for (const milestone of active) {
      lines.push(
        `ACTIVE STORY BEAT: ${truncate(milestone.title, 70)}`
      );

      if (milestone.encounter) {
        lines.push(
          `  Encounter opportunity: ${milestone.encounter.who} — ${milestone.encounter.where}. ${truncate(milestone.encounter.context, 180)}`
        );
      }

      lines.push(
        '  If Kan\'s scene reaches this beat, play it out fully on the page.'
      );
    }
  }

  // Free roam (audit 8): the timeline has run out, the world goes on.
  if (canonStoryOver(db)) {
    lines.push(
      '- The canon story is over: Naruto is the Seventh Hokage and the timeline has no more events. Play goes on in this same world, but never invent a new canon event, and nothing from any later era.'
    );
  }

  if (concluded.length > 0) {
    lines.push(
      'RECENTLY CONCLUDED (finished — never replay these): ' +
        concluded
          .map((milestone) => truncate(milestone.title, 60))
          .join('; ')
    );
  }

  return lines.join('\n');
}

/**
 * Canon ids for the state call. The narrator never sees ids; the state model
 * decides from the prose whether a beat played out or news was delivered.
 */
function formatCanonTracking(db: AppDatabase) {
  const lines: string[] = [];

  const tracked = trackedCanonBeats(db);

  for (const milestone of tracked.active) {
    const accepted = milestone.playerDriven ? ' You accepted it; it is under way.' : '';
    lines.push(
      `- ${milestone.id}: ${truncate(milestone.title, 70)} (active story beat).${accepted} canon_completed only at the moment it fully plays out on the page${milestone.completesWhen ? `: ${milestone.completesWhen}` : ''}; canon_engaged if Kan's scene took part in it this turn; canon_passed if the chance clearly slipped by (Kan left, time moved on).`
    );
  }

  for (const beat of tracked.offered) {
    lines.push(
      `- ${beat.id}: ${truncate(beat.title, 70)} (personal beat, offered). canon_engaged when Kan accepts or starts it this turn; canon_completed only when it actually happens on the page${beat.completesWhen ? `: ${beat.completesWhen}` : ''}. Never because time passed.`
    );
  }

  lines.push(...newsTrackingLines(newsOffer(db)));

  if (lines.length === 0) {
    return '';
  }

  return ['CANON TRACKING', ...lines].join('\n');
}

function formatPressure(db: AppDatabase, recentText: string) {
  const grudge = formatGrudgeOffer(db, grudgeOffer(db));

  if (grudge) {
    return grudge;
  }

  const comesBack = formatConsequenceOffer(db, turnConsequenceOffer(db));

  if (comesBack) {
    return comesBack;
  }

  return formatHunterOffer(hunterOffer(db)) || formatReturningCharacter(db, recentText);
}

function formatEnemyTracking(db: AppDatabase) {
  const refByEntity = refByEntityId(db);

  return [
    'REPUTATION & GRUDGES',
    ...reputationTrackingLines(db).map((line) => `- ${line}`),
    `- ${renownTrackingLine(db)}`,
    ...grudgeTrackingLines(grudgeOffer(db), (entity) => refByEntity.get(entity.id) ?? entity.name).map((line) => `- ${line}`),
    ...consequenceTrackingLines(turnConsequenceOffer(db)).map((line) => `- ${line}`),
  ].join('\n');
}

function formatLetterTracking(db: AppDatabase) {
  const refByEntity = refByEntityId(db);

  return [
    'LETTERS',
    ...letterTrackingLines(turnLetterOffer(db), (entity) => refByEntity.get(entity.id) ?? entity.name),
  ].join('\n');
}

/** Today's birthday, for the state tracker (bond moves and birthdays_learned). */
function formatYearlyTracking(db: AppDatabase) {
  const refByEntity = refByEntityId(db);
  const lines = yearlyTrackingLines(yearlyOffer(db), (entity) => refByEntity.get(entity.id) ?? entity.name);

  return lines.length ? ['THE DAY', ...lines.map((line) => `- ${line}`)].join('\n') : '';
}

function formatLoreProfile(db: AppDatabase, name: string) {
  const profile = loreProfileFor(name);

  if (!profile) {
    return '';
  }

  const era = eraNoteFor(name, db.state.inStoryDate.year);
  const entity = db.entities.find((item) => item.name === name);
  const romance = entity?.romanceAccessibility ?? (entity?.gender === 'male' ? 'not-applicable' : profile.romanceAccessibility);
  // A man's heart is never a romance option for Kan: only his devotion is told.
  const heart =
    romance === 'not-applicable'
      ? `; heart: ${truncate(profile.canonDevotion, 90)}`
      : `; heart: ${truncate(profile.canonDevotion, 90)} (${romance})${endgameNote(db, name)}`;

  return `${heart}${era ? `; now: ${truncate(era, 80)}` : ''}`;
}


function truncate(value: string, maxLength: number) {
  if (!value || value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trimEnd()}…`;
}

function formatMemories(db: AppDatabase, memories: EventRecord[]) {
  if (memories.length === 0) {
    return 'RELEVANT MEMORIES\nNone.';
  }

  return [
    'RELEVANT MEMORIES',
    ...memories.map((memory) => {
      // A memory written from a chapter summary recalls the whole summary;
      // the Journal shows only its short description.
      const full = memory.summaryId
        ? db.summaries.find((summary) => summary.id === memory.summaryId)?.text
        : undefined;
      const text = full ?? memory.summary;
      // A flashback is a memory of the past, lived again, not something that just happened.
      const past = memory.tags.includes('flashback') ? `(from Year ${memory.inStoryDate.year}, before the story) ` : '';
      return `- ${past}${memory.title ? `${memory.title}: ` : ''}${truncate(text, 400)}`;
    }),
  ].join('\n');
}

function tail(value: string, maxLength: number) {
  if (!value || value.length <= maxLength) {
    return value;
  }

  return `…${value.slice(-maxLength).trimStart()}`;
}

/**
 * Keeps the opening and the ending of a long text and cuts the middle, at
 * word boundaries: roughly 40% from the start and 60% from the end.
 */
export function headAndTail(value: string, maxLength: number) {
  if (!value || value.length <= maxLength) {
    return value;
  }

  const headLength = Math.floor(maxLength * 0.4);
  const tailLength = maxLength - headLength;
  let head = value.slice(0, headLength);
  const headCut = head.lastIndexOf(' ');

  if (headCut > headLength * 0.6) {
    head = head.slice(0, headCut);
  }

  let end = value.slice(-tailLength);
  const tailCut = end.indexOf(' ');

  if (tailCut !== -1 && tailCut < tailLength * 0.4) {
    end = end.slice(tailCut + 1);
  }

  return `${head.trimEnd()} […] ${end.trimStart()}`;
}

function formatRecentMessages(messages: RawLogEntry[]) {
  if (messages.length === 0) {
    return 'RECENT SCENE\nThe story is just beginning.';
  }

  const lastAssistantIndex = [...messages]
    .map((message, index) => (message.role === 'assistant' ? index : -1))
    .filter((index) => index >= 0)
    .pop();

  return [
    'RECENT SCENE (oldest first)',
    ...messages.map((message, index) => {
      if (message.role === 'user') {
        return `You (Kan): ${headAndTail(message.content, 500)}`;
      }

      const clean = stripNarrationJson(message.content);

      // The newest beat is shown nearly whole; older ones keep how they
      // opened and how they ended, so who arrived and what was set up isn't lost.
      return index === lastAssistantIndex
        ? `Narrator (continue directly from here): ${tail(clean, 2200)}`
        : `Narrator: ${headAndTail(clean, 1400)}`;
    }),
  ].join('\n');
}

function formatTimeLine(db: AppDatabase, audience: 'narrator' | 'state' = 'narrator', mode?: SceneModeName) {
  const stalled = db.state.turnsWithoutTimeChange ?? 0;
  const nudge =
    audience === 'narrator' && stalled >= 2
      ? ' — the last few beats never said how long they took; say plainly how much time passes.'
      : '';

  const label = audience === 'state' ? 'TIME BEFORE THIS TURN' : 'TIME';

  if (audience === 'state') {
    return `${label}\n${formatDate(db.state.inStoryDate)}`;
  }

  // The exact time now and the earliest this reply can end, so any hour the
  // narrator names matches the clock.
  const pace = db.state.scenePace ?? 'conversation';
  const ends = advanceSeconds(
    db.state.inStoryDate,
    mode === 'conversation' ? CONVERSATION_MODE_MINIMUM_SECONDS : mode === 'fight' ? paceMinimumSeconds('combat') : paceMinimumSeconds(pace)
  );

  return `${label}\n${formatDate(db.state.inStoryDate)} (exactly ${formatClock(db.state.inStoryDate)}; at this pace this reply ends no earlier than ${formatClock(ends)})${nudge}`;
}

/** Numbers the story has already stated (bounties, distances, deadlines): they stay the same. */
function formatFigures(db: AppDatabase) {
  const figures = db.facts.filter((fact) => fact.validTo === null && fact.type === 'figure').slice(-8);

  if (figures.length === 0) {
    return '';
  }

  return ['FIGURES ALREADY SAID (keep them exactly; never restate a different number)', ...figures.map((fact) => `- ${truncate(fact.text, 110)}`)].join('\n');
}

/** Met people who are not here, and where they were last seen or said to be. */
function formatElsewhere(db: AppDatabase) {
  const cast = new Set((db.state.sceneCast ?? []).map((name) => name.toLowerCase()));
  const people = db.entities
    .filter(
      (entity) =>
        entity.type === 'character' &&
        entity.name !== 'Kan' &&
        entity.met !== false &&
        entity.tier !== 'minor' &&
        !isDeceased(entity) &&
        !entity.companion &&
        !cast.has(entity.name.toLowerCase()) &&
        entity.lastSeen &&
        Math.abs(daysBetween(entity.lastSeen, db.state.inStoryDate)) <= 30
    )
    .sort((a, b) => dateSortValue(b.lastSeen!) - dateSortValue(a.lastSeen!))
    .slice(0, 6);

  if (people.length === 0) {
    return '';
  }

  return [
    'ELSEWHERE (not in this scene; each is where it says unless the story moves them, and never in two places)',
    ...people.map(
      (entity) =>
        `- ${narratorName(db, entity)}: ${entity.whereabouts ? truncate(entity.whereabouts, 70) : `last seen at ${truncate(entity.lastSeenAt ?? 'somewhere', 50)}`}`
    ),
  ].join('\n');
}

/**
 * What to show while the narrator is still streaming. The narrator writes
 * prose only, but if a model starts a code block or JSON object anyway, hide
 * everything from that point so it never flashes on screen.
 */
export function streamingPreview(partial: string): string {
  let cut = partial.length;
  const fence = partial.indexOf('```');

  if (fence !== -1) {
    cut = Math.min(cut, fence);
  }

  const json = /(?:^|\n)\s*\{\s*(?:"|$)/.exec(partial);

  if (json) {
    cut = Math.min(cut, json.index);
  }

  return partial.slice(0, cut).trimEnd();
}

export function stripNarrationJson(raw: string): string {
  const { narration } = splitNarrationAndDiff(raw);
  return narration;
}

const DIFF_KEY_PATTERN = /"(?:state|bonds|facts|threads|new_characters|image_worthy)"\s*:/;
const DIFF_OBJECT_START = /\{\s*"(?:state|bonds|facts|threads|new_characters|image_worthy)"/g;
const FENCE_OPEN = /```(?:json)?/g;
const TRAILING_LABEL =
  /^\s*\**\s*(?:state|json)\b[\w\s]{0,40}:\s*\**\s*$/i;

function isDiffLike(content: string, parsed: Record<string, unknown> | null): boolean {
  if (parsed && looksLikeStateDiff(parsed)) {
    return true;
  }

  return DIFF_KEY_PATTERN.test(content);
}

function cleanNarration(narration: string): string {
  let cleaned = narration.replace(FENCE_OPEN, '');

  for (;;) {
    const trimmedEnd = cleaned.replace(/[\s]+$/, '');
    const lastLineStart = trimmedEnd.lastIndexOf('\n');
    const lastLine = lastLineStart === -1 ? trimmedEnd : trimmedEnd.slice(lastLineStart + 1);

    if (lastLine.trim() && TRAILING_LABEL.test(lastLine)) {
      cleaned = trimmedEnd.slice(0, lastLineStart === -1 ? trimmedEnd.length : lastLineStart);
      continue;
    }

    cleaned = trimmedEnd;
    break;
  }

  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

export function splitNarrationAndDiff(raw: string): {
  narration: string;
  inlineDiff: Record<string, unknown> | null;
} {
  let junkStart = -1;
  let inlineDiff: Record<string, unknown> | null = null;

  FENCE_OPEN.lastIndex = 0;
  let fenceMatch: RegExpExecArray | null;

  while ((fenceMatch = FENCE_OPEN.exec(raw)) !== null) {
    const contentStart = fenceMatch.index + fenceMatch[0].length;
    const closing = raw.indexOf('```', contentStart);
    const content =
      closing === -1 ? raw.slice(contentStart) : raw.slice(contentStart, closing);
    const parsed = closing === -1 ? null : parseJsonBlock(content);

    if (isDiffLike(content, parsed)) {
      junkStart = fenceMatch.index;
      inlineDiff = parsed && looksLikeStateDiff(parsed) ? parsed : null;

      if (closing !== -1) {
        FENCE_OPEN.lastIndex = closing + 3;
      }
    } else if (closing !== -1) {
      FENCE_OPEN.lastIndex = closing + 3;
    }
  }

  if (junkStart === -1) {
    DIFF_OBJECT_START.lastIndex = 0;
    let markerMatch: RegExpExecArray | null;
    let lastMarker = -1;

    while ((markerMatch = DIFF_OBJECT_START.exec(raw)) !== null) {
      const parsed = parseJsonBlock(raw.slice(markerMatch.index));

      if (parsed && looksLikeStateDiff(parsed)) {
        junkStart = markerMatch.index;
        inlineDiff = parsed;
        break;
      }

      lastMarker = markerMatch.index;
    }

    if (junkStart === -1 && lastMarker !== -1) {
      junkStart = lastMarker;
      inlineDiff = null;
    }
  }

  if (junkStart === -1) {
    return { narration: cleanNarration(raw), inlineDiff: null };
  }

  return {
    narration: cleanNarration(raw.slice(0, junkStart)),
    inlineDiff,
  };
}

function looksLikeStateDiff(obj: Record<string, unknown>): boolean {
  const keys = Object.keys(obj);

  if (keys.length === 0) {
    return false;
  }

  const knownKeys = [
    'state', 'bonds', 'facts', 'threads', 'new_characters', 'image_worthy',
  ];

  return keys.some((key) => knownKeys.includes(key));
}

function parseJsonBlock(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();

  if (!trimmed || trimmed === '{}') {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed);

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to the last-balanced-brace search.
  }

  const start = trimmed.indexOf('{');

  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        try {
          const parsed = JSON.parse(trimmed.slice(start, index + 1));

          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
          }
        } catch {
          return null;
        }

        return null;
      }
    }
  }

  return null;
}

/** Every message of a state step's prompt, Core then World, as one text (Debug, tests). */
export function trackerPromptText(prompt: ReturnType<typeof buildExtractionPrompt>): string {
  return [...prompt.messages, ...(prompt.world?.messages ?? [])].map((message) => message.content).join('\n\n');
}
