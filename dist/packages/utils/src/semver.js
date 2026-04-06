function parseSemver(version) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
    if (!match) {
        throw new Error(`Invalid semver: ${version}`);
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}
export function bumpMinor(version) {
    const [major, minor] = parseSemver(version);
    return `${major}.${minor + 1}.0`;
}
export function bumpPatch(version) {
    const [major, minor, patch] = parseSemver(version);
    return `${major}.${minor}.${patch + 1}`;
}
export function compareSemver(a, b) {
    const parsedA = parseSemver(a);
    const parsedB = parseSemver(b);
    for (let index = 0; index < 3; index += 1) {
        if (parsedA[index] < parsedB[index]) {
            return -1;
        }
        if (parsedA[index] > parsedB[index]) {
            return 1;
        }
    }
    return 0;
}
//# sourceMappingURL=semver.js.map