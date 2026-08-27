import { readFile } from 'node:fs/promises';
const data = JSON.parse(await readFile(new URL('../compatibility/bolt-open-runtime-issues.json', import.meta.url), 'utf8'));
const allowed = new Set(['NEXARI-REQUIREMENT', 'BOLT-ONLY', 'DUPLICATE', 'NOT-A-RUNTIME-ISSUE', 'NEEDS-OWNER-DECISION']);
if (data.open_issue_count !== 79 || data.runtime_keyword_candidate_count !== 27 || data.triage.length !== 27) throw new Error('issue collection/triage count mismatch');
for (const issue of data.triage) {
  for (const key of ['number', 'url', 'title', 'category', 'reproducibility', 'bolt_impact', 'priority', 'disposition', 'rationale']) if (issue[key] === undefined || issue[key] === '') throw new Error(`issue missing ${key}`);
  if (!allowed.has(issue.disposition)) throw new Error(`issue #${issue.number} has invalid disposition`);
  if (issue.disposition === 'NEXARI-REQUIREMENT' && issue.requirement_ids.length === 0) throw new Error(`issue #${issue.number} has no requirement mapping`);
}
console.log(`Bolt issue triage OK (${data.triage.length}/${data.runtime_keyword_candidate_count} candidate reports classified)`);
