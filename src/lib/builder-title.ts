import { seededRandom } from "@/lib/hash";

/**
 * Builder title. Two halves: a temperament drawn from the identity hash, and a
 * craft noun drawn from whatever stack the person typed in. Nothing calls out
 * to a model, it is a lookup and a seeded shuffle, which is why it returns in
 * well under a millisecond and gives the same answer every time.
 */

const TEMPERAMENT = [
  "Midnight",
  "Offshore",
  "Barefoot",
  "Monsoon",
  "Cold-Start",
  "Salt-Crusted",
  "Low-Latency",
  "Sunburnt",
  "Off-Grid",
  "Hot-Reload",
  "Undocumented",
  "Tide-Fed",
  "Feral",
  "Deep-Water",
  "Half-Awake",
  "Zero-Config",
  "Last-Commit",
  "Overclocked",
  "Rate-Limited",
  "Sand-in-the-Keyboard",
];

type Craft = { match: RegExp; nouns: string[] };

const CRAFTS: Craft[] = [
  {
    match: /(front[- ]?end|react|next|vue|svelte|angular|css|tailwind|ui engineer)/i,
    nouns: ["Pixel Wrangler", "Layout Bender", "Interface Carpenter", "Render Goblin"],
  },
  {
    match: /(back[- ]?end|node|go\b|golang|rust|java|python|django|rails|api|server)/i,
    nouns: ["Endpoint Monk", "Throughput Hound", "Daemon Keeper", "Payload Smuggler"],
  },
  {
    match: /(full[- ]?stack|generalist|swe|software engineer)/i,
    nouns: ["Both-Ends Operator", "Whole-Stack Nomad", "Ship-It Generalist"],
  },
  {
    match: /(\bml\b|machine learning|deep learning|\bnlp\b|llm|neural|pytorch|tensorflow)/i,
    nouns: ["Weight Wrangler", "Gradient Tamer", "Loss-Curve Reader", "Eval Sceptic"],
  },
  {
    match: /(data|analytics|sql|warehouse|etl|pipeline|spark)/i,
    nouns: ["Pipeline Plumber", "Schema Archaeologist", "Query Whisperer"],
  },
  {
    match: /(devops|infra|sre|kubernetes|k8s|docker|cloud|aws|platform)/i,
    nouns: ["Cluster Shepherd", "Uptime Sentry", "Yaml Diplomat", "Blast-Radius Planner"],
  },
  {
    match: /(security|infosec|pentest|appsec|crypto(graphy)?)/i,
    nouns: ["Threat Cartographer", "Lockpick", "Blast Door", "Assumption Breaker"],
  },
  {
    match: /(design|ux|ui\/ux|product design|figma|motion|brand)/i,
    nouns: ["Grid Anarchist", "Kerning Zealot", "Taste Auditor", "Whitespace Hoarder"],
  },
  {
    match: /(product|\bpm\b|founder|bizdev|growth|gtm|marketing)/i,
    nouns: ["Scope Negotiator", "Demo Closer", "Roadmap Realist"],
  },
  {
    match: /(mobile|android|ios|swift|kotlin|flutter|react native)/i,
    nouns: ["Pocket-Screen Builder", "Cold-Boot Optimiser", "Store-Review Survivor"],
  },
  {
    match: /(web3|solidity|blockchain|smart contract|onchain|defi)/i,
    nouns: ["Chain Notary", "Gas Miser", "Contract Auditor"],
  },
  {
    match: /(game|unity|unreal|graphics|shader|webgl|three)/i,
    nouns: ["Frame-Budget Hawk", "Shader Sorcerer", "Physics Fiddler"],
  },
  {
    match: /(hardware|embedded|iot|robotics|firmware|arduino|esp32)/i,
    nouns: ["Solder Fume Veteran", "Bare-Metal Tinkerer", "Sensor Herder"],
  },
];

const FALLBACK_NOUNS = [
  "Ship-First Builder",
  "Prototype Arsonist",
  "Terminal Dweller",
  "Weekend Shipper",
  "Idea-to-Repo Converter",
];

function craftNouns(role: string): string[] {
  const matched = CRAFTS.filter((craft) => craft.match.test(role)).flatMap((craft) => craft.nouns);
  return matched.length > 0 ? matched : FALLBACK_NOUNS;
}

/** Six stable options. Index 0 is the default, the rest are there to cycle through. */
export function builderTitles(seed: string, role: string): string[] {
  const nouns = craftNouns(role);
  const random = seededRandom(`${seed}::title`);
  const titles: string[] = [];
  let guard = 0;

  while (titles.length < 6 && guard < 60) {
    guard++;
    const candidate = `${TEMPERAMENT[Math.floor(random() * TEMPERAMENT.length)]} ${
      nouns[Math.floor(random() * nouns.length)]
    }`;
    if (!titles.includes(candidate)) titles.push(candidate);
  }

  return titles;
}

/**
 * A short pick-list for anyone who would rather choose than reroll. Built from
 * the same two vocabularies the generator uses, so a chosen class and a rolled
 * one sit in the same world.
 */
export const PRESET_TITLES = [
  "Midnight Endpoint Monk",
  "Offshore Pixel Wrangler",
  "Cold-Start Cluster Shepherd",
  "Barefoot Both-Ends Operator",
  "Monsoon Gradient Tamer",
  "Salt-Crusted Pipeline Plumber",
  "Feral Prototype Arsonist",
  "Deep-Water Threat Cartographer",
  "Zero-Config Yaml Diplomat",
  "Half-Awake Terminal Dweller",
  "Sunburnt Grid Anarchist",
  "Overclocked Scope Negotiator",
];

export function builderTitle(seed: string, role: string, index = 0): string {
  const titles = builderTitles(seed, role);
  return titles[((index % titles.length) + titles.length) % titles.length];
}
