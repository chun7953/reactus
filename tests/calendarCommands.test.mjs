import test from 'node:test';
import assert from 'node:assert/strict';

import calendarpost from '../src/commands/calendar/calendarpost.js';
import calendaredit from '../src/commands/calendar/calendaredit.js';

function assertValidDiscordCommand(command) {
    const json = command.data.toJSON();
    assert.ok(json.name);
    for (const subcommand of json.options || []) {
        assert.ok((subcommand.options || []).length <= 25, `${json.name} ${subcommand.name} exceeds Discord's 25-option limit`);
    }
    return json;
}

test('calendarpost serializes to a valid Discord application command payload', () => {
    const json = assertValidDiscordCommand(calendarpost);
    assert.equal(json.name, 'calendarpost');
});

test('calendaredit serializes to a valid Discord application command payload', () => {
    const json = assertValidDiscordCommand(calendaredit);
    assert.equal(json.name, 'calendaredit');
    const giveaway = json.options.find(option => option.name === 'giveaway');
    assert.ok(giveaway);
    assert.equal(giveaway.options.length, 25);
});
