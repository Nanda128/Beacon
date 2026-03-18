import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

const TOKENS_FILE = resolve("src/theme/tokens.ts");
const REPORT_DIR = resolve("reports");
const REPORT_FILE = resolve(REPORT_DIR, "contrast-report.json");

const WCAG_THRESHOLDS = {
    text: 4.5,
    largeText: 3,
    ui: 3,
};

const PAIRS = [
    {id: "body-text", level: "text", fg: "--color-text", bg: "--color-bg"},
    {id: "secondary-text", level: "text", fg: "--color-text-secondary", bg: "--color-bg"},
    {id: "muted-text", level: "text", fg: "--color-text-muted", bg: "--color-bg"},
    {id: "text-on-raised", level: "text", fg: "--color-text", bg: "--color-bg-raised"},
    {id: "secondary-on-raised", level: "text", fg: "--color-text-secondary", bg: "--color-bg-raised"},
    {id: "muted-on-raised", level: "text", fg: "--color-text-muted", bg: "--color-bg-raised"},
    {id: "primary-button", level: "text", fg: "--color-primary-text", bg: "--color-primary"},
    {id: "skip-link", level: "text", fg: "--color-primary-text", bg: "--color-primary"},
    {id: "success-callout", level: "text", fg: "--color-success-text", bg: "--color-success-bg"},
    {id: "warning-callout", level: "text", fg: "--color-warning-text", bg: "--color-warning-bg"},
    {id: "danger-callout", level: "text", fg: "--color-danger-text", bg: "--color-danger-bg"},
    {id: "focus-ring", level: "ui", fg: "--color-focus-ring", bg: "--color-bg"},
    {id: "input-border", level: "ui", fg: "--color-border", bg: "--color-bg-inset"},
    {id: "panel-border", level: "ui", fg: "--color-border-subtle", bg: "--color-bg-raised"},
    {id: "alert-border", level: "ui", fg: "--color-border-strong", bg: "--color-bg-raised"},
];

function parseTokenBlock(source, name) {
    const blockRegex = new RegExp(`export const ${name}: Record<string, string> = \\\{([\\s\\S]*?)\\n};`);
    const blockMatch = source.match(blockRegex);
    if (!blockMatch) {
        throw new Error(`Unable to find token block: ${name}`);
    }

    const tokenRegex = /"([^"]+)":\s*"([^"]+)"/g;
    const tokens = {};
    let tokenMatch;
    while ((tokenMatch = tokenRegex.exec(blockMatch[1])) !== null) {
        tokens[tokenMatch[1]] = tokenMatch[2];
    }
    return tokens;
}

function parseColor(value) {
    const trimmed = value.replace(/\s+/g, "");

    if (trimmed.startsWith("#")) {
        const hex = trimmed.slice(1);
        if (hex.length !== 6) {
            throw new Error(`Expected 6-char hex color, got: ${value}`);
        }
        return {
            r: Number.parseInt(hex.slice(0, 2), 16),
            g: Number.parseInt(hex.slice(2, 4), 16),
            b: Number.parseInt(hex.slice(4, 6), 16),
            a: 1,
        };
    }

    const rgbMatch = trimmed.match(/^rgba?\((.+)\)$/i);
    if (rgbMatch) {
        const parts = rgbMatch[1].split(",").map(Number.parseFloat);
        if (parts.length === 3) {
            return {r: parts[0], g: parts[1], b: parts[2], a: 1};
        }
        if (parts.length === 4) {
            return {r: parts[0], g: parts[1], b: parts[2], a: parts[3]};
        }
    }

    throw new Error(`Unsupported color format: ${value}`);
}

function composite(foreground, background) {
    const alpha = foreground.a;
    return {
        r: foreground.r * alpha + background.r * (1 - alpha),
        g: foreground.g * alpha + background.g * (1 - alpha),
        b: foreground.b * alpha + background.b * (1 - alpha),
        a: 1,
    };
}

function relativeLuminance({r, g, b}) {
    const linearized = [r, g, b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * linearized[0] + 0.7152 * linearized[1] + 0.0722 * linearized[2];
}

function contrastRatio(a, b) {
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

function runAudit(theme, tokenMap) {
    const baseSurface = parseColor(tokenMap["--color-bg"]);
    return PAIRS.map((pair) => {
        const fgValue = tokenMap[pair.fg];
        const bgValue = tokenMap[pair.bg];
        if (!fgValue || !bgValue) {
            throw new Error(`Missing token for pair '${pair.id}' (${pair.fg} vs ${pair.bg})`);
        }

        const bgRaw = parseColor(bgValue);
        const bg = bgRaw.a < 1 ? composite(bgRaw, baseSurface) : bgRaw;

        const fgRaw = parseColor(fgValue);
        const fg = fgRaw.a < 1 ? composite(fgRaw, bg) : fgRaw;
        const ratio = contrastRatio(fg, bg);
        const minimum = WCAG_THRESHOLDS[pair.level];
        const passes = ratio >= minimum;

        return {
            theme,
            pair: pair.id,
            level: pair.level,
            threshold: minimum,
            ratio: Number(ratio.toFixed(2)),
            passes,
        };
    });

}

function printReport(results) {
    const grouped = results.reduce((acc, entry) => {
        acc[entry.theme] ??= [];
        acc[entry.theme].push(entry);
        return acc;
    }, {});

    Object.entries(grouped).forEach(([theme, entries]) => {
        console.log(`\n${theme}`);
        entries.forEach((entry) => {
            const icon = entry.passes ? "PASS" : "FAIL";
            console.log(
                `${icon.padEnd(5)} ${entry.pair.padEnd(20)} ${entry.ratio.toFixed(2)}:1 (min ${entry.threshold}:1)`
            );
        });
    });
}

const source = readFileSync(TOKENS_FILE, "utf8");
const lightTokens = parseTokenBlock(source, "lightTokens");
const darkTokens = parseTokenBlock(source, "darkTokens");

const report = [...runAudit("light", lightTokens), ...runAudit("dark", darkTokens)];
const failing = report.filter((entry) => !entry.passes);

mkdirSync(REPORT_DIR, {recursive: true});
writeFileSync(
    REPORT_FILE,
    `${JSON.stringify({generatedAt: new Date().toISOString(), report}, null, 2)}\n`,
    "utf8"
);

printReport(report);
console.log(`\nSaved JSON report to ${REPORT_FILE}`);

if (failing.length > 0) {
    console.error(`\nWCAG contrast audit failed with ${failing.length} violation(s).`);
    process.exitCode = 1;
} else {
    console.log("\nWCAG contrast audit passed.");
}



