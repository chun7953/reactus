import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const indexPath = new URL('../src/index.js', import.meta.url);
const eventsDirectory = new URL('../src/events/', import.meta.url);

test('gateway intents include the data Reactus actively consumes without reaction events', async () => {
  const [source, eventFiles] = await Promise.all([
    readFile(indexPath, 'utf8'),
    readdir(eventsDirectory),
  ]);

  assert.match(source, /GatewayIntentBits\.Guilds/);
  assert.match(source, /GatewayIntentBits\.GuildMessages/);
  assert.match(source, /GatewayIntentBits\.GuildMembers/);
  assert.match(source, /GatewayIntentBits\.MessageContent/);
  assert.match(source, /GatewayIntentBits\.GuildEmojisAndStickers/);
  assert.doesNotMatch(source, /GatewayIntentBits\.GuildMessageReactions/);

  const eventSources = await Promise.all(
    eventFiles.filter(name => name.endsWith('.js')).map(name => readFile(new URL(name, eventsDirectory), 'utf8')),
  );
  const allEvents = eventSources.join('\n');
  assert.doesNotMatch(allEvents, /MessageReaction(Add|Remove|RemoveAll|RemoveEmoji)/);
});
