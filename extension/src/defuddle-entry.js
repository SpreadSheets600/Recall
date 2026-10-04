import { Defuddle } from '../node_modules/defuddle/dist/defuddle.js';
import { toMarkdown } from '../node_modules/defuddle/dist/markdown.js';

export { Defuddle, toMarkdown };
if (typeof window !== 'undefined') {
    window.Defuddle = Defuddle;
    window.defuddleToMarkdown = toMarkdown;
}
