// npm-style semver, kept in parity with the server's own range evaluator
// (akka-bbb-apps/src/main/scala/org/bigbluebutton/core/util/SemverRange.scala).
// The directory decides which plugin version a stable URL serves; if it judged
// compatibility differently from the server, a stable URL could serve a plugin
// that the server then refuses to load.

// Like the server, a full version has no "v" prefix ("v1.0.0" is rejected).
const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;
const PARTIAL_VERSION_PATTERN =
  /^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const COMPARATOR_PATTERN = /^(>=|<=|>|<|=|\^|~>|~)?(.+)$/;
const HYPHEN_RANGE_PATTERN = /^(\S+)\s+-\s+(\S+)$/;
const SPACE_AFTER_OPERATOR_PATTERN = /(>=|<=|>|<|=|\^|~>|~)\s+/g;

/** Parses a full semver version ("1.2.3", "1.0.0-beta.3"). Throws on anything else. */
export function parseVersion(raw) {
  const match = VERSION_PATTERN.exec(String(raw).trim());
  if (!match) throw new Error(`Invalid version [${raw}]`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    preRelease: match[4] ? match[4].split('.') : [],
  };
}

export function isValidVersion(raw) {
  try {
    parseVersion(raw);
    return true;
  } catch {
    return false;
  }
}

/** Canonical form: drops a leading "v" (as used in git tags) and build metadata. */
export function normalizeVersion(raw) {
  const v = parseVersion(String(raw).trim().replace(/^v/, ''));
  const core = `${v.major}.${v.minor}.${v.patch}`;
  return v.preRelease.length ? `${core}-${v.preRelease.join('.')}` : core;
}

function compareIdentifiers(a, b) {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) return Math.sign(Number(a) - Number(b));
  if (aNumeric) return -1;
  if (bNumeric) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareParsed(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return Math.sign(a[key] - b[key]);
  }
  if (!a.preRelease.length && !b.preRelease.length) return 0;
  if (!a.preRelease.length) return 1;
  if (!b.preRelease.length) return -1;
  const length = Math.max(a.preRelease.length, b.preRelease.length);
  for (let i = 0; i < length; i++) {
    if (a.preRelease[i] === undefined) return -1;
    if (b.preRelease[i] === undefined) return 1;
    const result = compareIdentifiers(a.preRelease[i], b.preRelease[i]);
    if (result !== 0) return result;
  }
  return 0;
}

/** Negative, zero or positive, like a sort comparator. */
export function compareVersions(a, b) {
  return compareParsed(parseVersion(a), parseVersion(b));
}

function version(major, minor, patch, preRelease = []) {
  return { major, minor, patch, preRelease };
}

function samePatch(a, b) {
  return a.major === b.major && a.minor === b.minor && a.patch === b.patch;
}

function comparator(operator, bound) {
  return { operator, bound };
}

function comparatorMatches({ operator, bound }, v) {
  const result = compareParsed(v, bound);
  switch (operator) {
    case '>=': return result >= 0;
    case '<=': return result <= 0;
    case '>': return result > 0;
    case '<': return result < 0;
    case '=': return result === 0;
    default: throw new Error(`Unknown operator [${operator}]`);
  }
}

const MATCH_NOTHING = [comparator('<', version(0, 0, 0))];

function parsePartialVersion(raw) {
  const match = PARTIAL_VERSION_PATTERN.exec(raw);
  if (!match) throw new Error(`Invalid version [${raw}]`);
  const number = (part) => (part === undefined || /^[xX*]$/.test(part) ? undefined : Number(part));
  const major = number(match[1]);
  const minor = major === undefined ? undefined : number(match[2]);
  const patch = minor === undefined ? undefined : number(match[3]);
  const preRelease = patch !== undefined && match[4] ? match[4] : undefined;
  return { major, minor, patch, preRelease };
}

const isWildcard = (p) => p.major === undefined;
const isComplete = (p) => p.patch !== undefined;

function lowerBound(p) {
  return version(p.major ?? 0, p.minor ?? 0, p.patch ?? 0, p.preRelease ? p.preRelease.split('.') : []);
}

function nextAfterMissingPart(p) {
  if (p.minor === undefined) return version(p.major + 1, 0, 0);
  return version(p.major, p.minor + 1, 0);
}

function tildeUpperBound(p) {
  return p.minor === undefined ? version(p.major + 1, 0, 0) : version(p.major, p.minor + 1, 0);
}

function caretUpperBound(p) {
  if (p.major > 0) return version(p.major + 1, 0, 0);
  if (p.minor === undefined) return version(1, 0, 0);
  if (p.minor > 0) return version(0, p.minor + 1, 0);
  if (p.patch === undefined) return version(0, 1, 0);
  return version(0, 0, p.patch + 1);
}

function parseComparator(token) {
  const match = COMPARATOR_PATTERN.exec(token);
  if (!match) throw new Error(`Invalid comparator [${token}]`);
  const operator = match[1] ?? '=';
  const p = parsePartialVersion(match[2]);
  switch (operator) {
    case '=':
      if (isWildcard(p)) return [];
      if (isComplete(p)) return [comparator('=', lowerBound(p))];
      return [comparator('>=', lowerBound(p)), comparator('<', nextAfterMissingPart(p))];
    case '>=':
      return isWildcard(p) ? [] : [comparator('>=', lowerBound(p))];
    case '>':
      if (isWildcard(p)) return MATCH_NOTHING;
      if (isComplete(p)) return [comparator('>', lowerBound(p))];
      return [comparator('>=', nextAfterMissingPart(p))];
    case '<':
      return isWildcard(p) ? MATCH_NOTHING : [comparator('<', lowerBound(p))];
    case '<=':
      if (isWildcard(p)) return [];
      if (isComplete(p)) return [comparator('<=', lowerBound(p))];
      return [comparator('<', nextAfterMissingPart(p))];
    case '~':
    case '~>':
      return isWildcard(p) ? [] : [comparator('>=', lowerBound(p)), comparator('<', tildeUpperBound(p))];
    case '^':
      return isWildcard(p) ? [] : [comparator('>=', lowerBound(p)), comparator('<', caretUpperBound(p))];
    default:
      throw new Error(`Invalid comparator [${token}]`);
  }
}

function parseComparatorSet(comparatorSet) {
  const trimmed = comparatorSet.trim();
  const hyphen = HYPHEN_RANGE_PATTERN.exec(trimmed);
  if (hyphen) {
    const from = parsePartialVersion(hyphen[1]);
    const to = parsePartialVersion(hyphen[2]);
    const lower = isWildcard(from) ? [] : [comparator('>=', lowerBound(from))];
    let upper = [];
    if (!isWildcard(to)) {
      upper = isComplete(to) ? [comparator('<=', lowerBound(to))] : [comparator('<', nextAfterMissingPart(to))];
    }
    return [...lower, ...upper];
  }
  return trimmed
    .replace(SPACE_AFTER_OPERATOR_PATTERN, '$1')
    .split(/[\s&]+/)
    .filter(Boolean)
    .flatMap(parseComparator);
}

function satisfiesComparatorSet(v, comparators) {
  // npm rule, as in the server: a pre-release only satisfies a range that
  // explicitly opts into pre-releases of the same major.minor.patch.
  const preReleaseAllowed =
    !v.preRelease.length ||
    comparators.some((c) => c.bound.preRelease.length && samePatch(c.bound, v));
  return preReleaseAllowed && comparators.every((c) => comparatorMatches(c, v));
}

/** True when `versionString` satisfies the npm-style `range`, exactly as the server decides it. */
export function satisfies(versionString, range) {
  const v = parseVersion(versionString);
  // Same split as the server: "||" and a single "|" both separate alternatives.
  return String(range)
    .split(/\|\|?/)
    .some((set) => satisfiesComparatorSet(v, parseComparatorSet(set)));
}

/** Throws when `range` cannot be parsed. */
export function assertValidRange(range) {
  String(range).split(/\|\|?/).forEach(parseComparatorSet);
}

/**
 * Name of the SDK line a version belongs to, as the server computes it for
 * %%HTML5_PLUGIN_SDK_MAIN_VERSION%% (PluginUtils.getPluginSdkMainVersion):
 * every 0.x minor is a line of its own; from 1.0 on the major alone.
 */
export function sdkLineOf(versionString) {
  const v = parseVersion(versionString);
  return v.major === 0 ? `0.${v.minor}` : String(v.major);
}

/** "4.0" for "4.0.4", as the server computes it for %%BBB_MAIN_VERSION%%. */
export function mainVersionOf(versionString) {
  const v = parseVersion(versionString);
  return `${v.major}.${v.minor}`;
}
