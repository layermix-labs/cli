import fs from "node:fs";
import path from "node:path";

export interface JUnitTaskResult {
	id: string;
	classname: string;
	durationMs: number;
	status: "success" | "failure" | "skipped";
	message?: string;
	output?: string;
}

// XML 1.0 disallows most C0 control characters (only TAB, LF, CR are legal).
// Strip anything else so downstream parsers don't choke on attribute values or CDATA.
// Constructor form keeps the raw control bytes out of the source; the literal
// form triggers biome's noControlCharactersInRegex.
// biome-ignore lint/complexity/useRegexLiterals: see comment above.
const ILLEGAL_XML_CHARS = new RegExp(
	"[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]",
	"g",
);

function escapeAttr(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
		.replace(ILLEGAL_XML_CHARS, "");
}

function cdata(s: string): string {
	const safe = s.replace(ILLEGAL_XML_CHARS, "");
	return `<![CDATA[${safe.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function buildJUnitXml(
	results: JUnitTaskResult[],
	suiteName = "layermix",
): string {
	const total = results.length;
	const failures = results.filter((r) => r.status === "failure").length;
	const skipped = results.filter((r) => r.status === "skipped").length;
	const totalTime = (
		results.reduce((s, r) => s + r.durationMs, 0) / 1000
	).toFixed(3);

	const cases = results
		.map((r) => {
			const time = (r.durationMs / 1000).toFixed(3);
			const attrs = `classname="${escapeAttr(r.classname)}" name="${escapeAttr(r.id)}" time="${time}"`;

			const children: string[] = [];
			if (r.status === "failure") {
				const msg = escapeAttr(r.message || "Task failed");
				children.push(
					`      <failure message="${msg}" type="CommandFailed">${cdata(r.output || r.message || "")}</failure>`,
				);
			} else if (r.status === "skipped") {
				children.push(`      <skipped message="Dependency failed"/>`);
			}
			if (r.output && r.status === "success") {
				children.push(`      <system-out>${cdata(r.output)}</system-out>`);
			}

			if (children.length === 0) {
				return `    <testcase ${attrs}/>`;
			}
			return `    <testcase ${attrs}>\n${children.join("\n")}\n    </testcase>`;
		})
		.join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="${escapeAttr(suiteName)}" tests="${total}" failures="${failures}" skipped="${skipped}" time="${totalTime}">
  <testsuite name="${escapeAttr(suiteName)}" tests="${total}" failures="${failures}" skipped="${skipped}" time="${totalTime}">
${cases}
  </testsuite>
</testsuites>
`;
}

export function writeJUnitReport(
	filePath: string,
	results: JUnitTaskResult[],
	suiteName = "layermix",
): string {
	const xml = buildJUnitXml(results, suiteName);
	const abs = path.isAbsolute(filePath)
		? filePath
		: path.resolve(process.cwd(), filePath);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, xml);
	return abs;
}
