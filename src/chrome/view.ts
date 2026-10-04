import type { Outcome } from '../application/messages';
import { categories, type Suggestion } from '../domain/review';

const host = document.createElement('div');
host.dataset.grammarProse = '';
document.documentElement.append(host);
export const shadow = host.attachShadow({ mode: 'open' });
const style = document.createElement('style');
style.textContent = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  button {
    background: #fff;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    color: #17233b;
    cursor: pointer;
    font: inherit;
    padding: 6px 9px;
  }
  button:focus-visible { outline: 3px solid #728aff; }
  #badge {
    background: #293f79;
    border: 0;
    border-radius: 20px;
    color: white;
    font: 600 12px system-ui;
    padding: 7px 10px;
    position: fixed;
    z-index: 2147483647;
  }
  #panel {
    background: #fff;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    bottom: 16px;
    box-shadow: 0 8px 40px #0003;
    color: #17233b;
    font: 14px/1.5 system-ui;
    max-height: 70vh;
    max-width: calc(100vw - 32px);
    overflow: auto;
    padding: 18px;
    position: fixed;
    right: 16px;
    width: 360px;
    z-index: 2147483647;
  }
  h2 { font-size: 17px; margin: 0 0 10px; }
  h3 { font-size: 14px; margin: 14px 0 5px; text-transform: capitalize; }
  p { margin: 7px 0; overflow-wrap: anywhere; white-space: pre-wrap; }
  article { border-top: 1px solid #e2e8f0; padding: 10px 0; }
  .actions, footer { display: flex; flex-wrap: wrap; gap: 6px; }
  del { color: #9b3343; }
  ins { color: #14684e; text-decoration: none; }
  footer { margin-top: 14px; }
  [hidden] { display: none !important; }
`;
shadow.append(style);
export const badge = document.createElement('button');
badge.id = 'badge';
badge.hidden = true;
badge.setAttribute('aria-label', 'Show writing suggestions');
export const panel = document.createElement('section');
panel.id = 'panel';
panel.hidden = true;
panel.setAttribute('aria-label', 'Writing suggestions');
shadow.append(badge, panel);

interface ReviewActions {
  accept(suggestion: Suggestion): void;
  copy(suggestion: Suggestion): void;
  reject(suggestion: Suggestion, outcome: Outcome): void;
  check(): void;
  disableField(): void;
  disableSite(): void;
  settings(): void;
  close(): void;
}

function button(text: string, action: () => void) {
  const element = document.createElement('button');
  element.textContent = text;
  element.onclick = action;

  return element;
}

function paragraph(text: string) {
  const paragraphElement = document.createElement('p');
  paragraphElement.textContent = text;

  return paragraphElement;
}

function createSuggestionArticle(
  suggestion: Suggestion,
  canReplace: boolean,
  reviewActions: ReviewActions,
): HTMLElement {
  const article = document.createElement('article');
  const originalText = document.createElement('del');
  const replacementText = document.createElement('ins');
  const originalParagraph = document.createElement('p');
  const replacementParagraph = document.createElement('p');
  const actions = document.createElement('div');

  originalText.textContent = suggestion.original;
  replacementText.textContent = suggestion.replacement;
  originalParagraph.append(originalText);
  replacementParagraph.append(replacementText);
  actions.className = 'actions';

  if (canReplace) {
    actions.append(button('Accept', () => reviewActions.accept(suggestion)));
  }

  actions.append(
    button('Copy suggestion', () => reviewActions.copy(suggestion)),
    button('Reject', () => reviewActions.reject(suggestion, 'rejected')),
  );

  if (suggestion.category === 'tone') {
    actions.append(button('Too soft', () => reviewActions.reject(suggestion, 'too-soft')));
  }

  article.append(
    originalParagraph,
    replacementParagraph,
    paragraph(suggestion.explanation),
    actions,
  );

  return article;
}

function createReviewFooter(actions: ReviewActions): HTMLElement {
  const footer = document.createElement('footer');

  footer.append(
    button('Check again', () => actions.check()),
    button('Disable field', () => actions.disableField()),
    button('Disable site', () => actions.disableSite()),
    button('Settings', () => actions.settings()),
    button('Close', () => actions.close()),
  );

  return footer;
}

export function renderReview(
  status: string,
  suggestions: Suggestion[],
  canReplace: boolean,
  actions: ReviewActions,
): void {
  const title = document.createElement('h2');
  title.textContent = 'Grammar Prose';
  panel.replaceChildren(title, paragraph(status));

  for (const category of categories) {
    const categorySuggestions = suggestions.filter(
      (suggestion) => suggestion.category === category,
    );

    if (!categorySuggestions.length) {
      continue;
    }

    const heading = document.createElement('h3');
    heading.textContent = category;
    panel.append(heading);

    for (const suggestion of categorySuggestions) {
      panel.append(createSuggestionArticle(suggestion, canReplace, actions));
    }
  }

  panel.append(createReviewFooter(actions));
}
