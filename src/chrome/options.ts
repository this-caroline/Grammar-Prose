import { ChromeMemory, readSettings } from '../adapters/storage';
import { emptyMemory, validateMemory } from '../domain/review';
import { send } from './messages';

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const status = document.getElementById('status')!;
const memory = new ChromeMemory();

async function action(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    status.textContent = (error as Error).message;
  }
}

async function refreshMemory() {
  input('memory').value = JSON.stringify(await memory.read(), null, 2);
}

void action(async () => {
  const commands = await chrome.commands.getAll();
  const shortcut = commands.find((command) => command.name === 'review-field')?.shortcut;
  document.getElementById('review-shortcut')!.textContent = shortcut
    ? `Use ${shortcut} to request a review.`
    : 'No review shortcut is assigned. Set one at chrome://extensions/shortcuts.';
});

document.getElementById('settings')!.onsubmit = (event) => {
  event.preventDefault();
  void action(async () => {
    await send({
      type: 'save-settings',
      model: input('model').value,
      disabledSites: input('sites').value.split(/\s+/).filter(Boolean),
    });
    status.textContent = 'Settings saved.';
  });
};

document.getElementById('connect')!.onclick = () => {
  void action(async () => {
    status.textContent = 'Connecting to local Ollama…';
    const { models } = await send({ type: 'models' });
    const list = document.getElementById('models')!;
    list.replaceChildren(
      ...models.map((name: string) => {
        const option = document.createElement('option');
        option.value = name;

        return option;
      }),
    );
    status.textContent = `Connected. ${models.length} installed model(s). Select a local model by name above.`;
  });
};

document.getElementById('save-memory')!.onclick = () => {
  void action(async () => {
    const value = validateMemory(JSON.parse(input('memory').value));
    await send({ type: 'save-memory', memory: value });
    await refreshMemory();
    status.textContent = 'Memory saved.';
  });
};

document.getElementById('delete-memory')!.onclick = () => {
  void action(async () => {
    await send({ type: 'save-memory', memory: emptyMemory() });
    await refreshMemory();
    status.textContent = 'Memory deleted.';
  });
};

document.getElementById('export-memory')!.onclick = () => {
  void action(async () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(await memory.read(), null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'grammar-prose-memory.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Saved memory exported.';
  });
};

void action(async () => {
  const settings = await readSettings();
  input('model').value = settings.model;
  input('sites').value = settings.disabledSites.join('\n');
  await refreshMemory();
});
