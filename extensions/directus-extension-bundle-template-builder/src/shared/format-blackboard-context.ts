import {
  BlackboardEntry,
  isFileSkill,
  isCollectionSkill,
  FileSkillEntry,
  CollectionSkillEntry,
} from './types';

export function formatBlackboardContext(
  entries: Record<string, BlackboardEntry>
): string {
  const staticEntries: BlackboardEntry[] = [];
  const fileSkills: FileSkillEntry[] = [];
  const collectionSkills: CollectionSkillEntry[] = [];

  for (const entry of Object.values(entries)) {
    if (isFileSkill(entry)) {
      fileSkills.push(entry);
    } else if (isCollectionSkill(entry)) {
      collectionSkills.push(entry);
    } else {
      staticEntries.push(entry);
    }
  }

  const sections: string[] = [];

  if (staticEntries.length > 0) {
    const lines = staticEntries.map((e) => {
      const valueStr = typeof e.value === 'string'
        ? `"${e.value}"`
        : JSON.stringify(e.value);
      return `- ${e.key}: ${valueStr}`;
    });
    sections.push(`## Project Context\n${lines.join('\n')}`);
  }

  if (fileSkills.length > 0) {
    const lines = fileSkills.map((e) => {
      const v = e.value;
      const pageInfo = v.page_count ? ` (${v.page_count} pages)` : '';
      return `- **${e.key}**: ${v.summary}${pageInfo}\n  → Use: read_file("${e.key}")`;
    });
    sections.push(`## Available File Skills\n${lines.join('\n\n')}`);
  }

  if (collectionSkills.length > 0) {
    const lines = collectionSkills.map((e) => {
      const v = e.value;
      const rowCount = v.row_count.toLocaleString();
      const fields = Object.keys(v.schema).join(', ');
      return `- **${e.key}**: ${v.summary} (${rowCount} rows)\n  Fields: ${fields}\n  → Use: query_collection("${e.key}", filter={...})`;
    });
    sections.push(`## Available Collection Skills\n${lines.join('\n\n')}`);
  }

  return sections.join('\n\n');
}
