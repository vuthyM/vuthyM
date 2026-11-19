import { genFieldsMarkdown } from './templates.js';

/* What is sent to Claude. The app shows the whole text before anything is sent, and it can be edited. */

export const CLAUDE_SYSTEM = 'You are helping a Dungeon Master prepare and run a Dungeons & Dragons 5e game. '
  + 'Answer only from the text you are given and from general D&D knowledge. If something is not in the text, say so instead of inventing it. '
  + 'Keep answers concise and practical, in plain markdown.';

/* a generated result -> two read-aloud paragraphs */
export function expandPrompt(g, vals, campaignName) {
  return 'I am a Dungeon Master running a D&D 5e campaign' + (campaignName ? ' called "' + campaignName + '"' : '') + '. '
    + 'Here is a rough ' + g.name.toLowerCase() + ' I generated:\n\n'
    + genFieldsMarkdown(g, vals) + '\n\n'
    + 'Turn it into two short paragraphs I can read aloud to the players: vivid, specific, and built only from the details above. '
    + 'Leave anything secret or hidden out of the read-aloud text. After the two paragraphs, add one line starting "DM notes:" that lists the secrets and hooks to remember.';
}

/* one note + a question. The text after "My question:" is for the user to fill in. */
export const QUESTION_MARK = 'My question:';
export function notePrompt(note, campaignName) {
  return 'Here is one note from my D&D campaign' + (campaignName ? ' "' + campaignName + '"' : '') + '. This is all of it that you can see.\n\n'
    + '---\n' + String(note.text).replace(/\s+$/, '') + '\n---\n\n' + QUESTION_MARK + ' ';
}
