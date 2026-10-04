import { createElement, useState, type ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';

function ControlledField({ tag, label }: { tag: 'input' | 'textarea'; label: string }) {
  const [text, setText] = useState('The tests is failing. Please fix this today.');
  const [revision, setRevision] = useState(0);

  return createElement(
    'section',
    null,
    createElement('label', { htmlFor: tag }, label),
    createElement(tag, {
      id: tag,
      value: text,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setText(event.target.value),
    }),
    createElement('output', { 'aria-label': `${label} state` }, text),
    createElement('button', { onClick: () => setRevision(revision + 1) }, `${label} rerender`),
    createElement('span', null, revision),
  );
}

const root = document.getElementById('react-root');

if (!root) {
  throw new Error('React fixture root unavailable.');
}

createRoot(root).render(
  createElement(
    'div',
    null,
    createElement(ControlledField, { tag: 'input', label: 'React input' }),
    createElement(ControlledField, { tag: 'textarea', label: 'React textarea' }),
  ),
);
