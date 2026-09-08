import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCalendarRoutingProperties,
  calendarDisplaySummary,
  resolveCalendarRoute,
} from '../src/lib/calendarRouting.js';

const normal = {
  id: 11,
  channel_id: '100',
  calendar_id: 'calendar@example.com',
  trigger_keyword: 'ご連絡',
};
const giveaway = {
  id: 22,
  channel_id: '200',
  calendar_id: 'calendar@example.com',
  trigger_keyword: 'ラキショ',
};

test('metadata routes a clean Reactus event without a visible trigger prefix', () => {
  const properties = buildCalendarRoutingProperties(giveaway, 'giveaway');
  const event = { summary: '王位スキルブック', description: '【王位スキルブック/1】' };
  const route = resolveCalendarRoute(event, [normal, giveaway], properties);

  assert.equal(route.monitor.id, giveaway.id);
  assert.equal(route.type, 'giveaway');
  assert.equal(route.source, 'metadata');
  assert.equal(calendarDisplaySummary(event, route), '王位スキルブック');
});

test('metadata monitor identity wins over legacy-looking text', () => {
  const properties = buildCalendarRoutingProperties(normal, 'post');
  const event = { summary: '通常投稿', description: '本文に【ラキショ】という語がある' };
  const route = resolveCalendarRoute(event, [normal, giveaway], properties);

  assert.equal(route.monitor.id, normal.id);
  assert.equal(route.type, 'post');
  assert.equal(route.source, 'metadata');
});

test('legacy Google Calendar entries still route by bracket keyword', () => {
  const event = { summary: '【ラキショ】旧方式の抽選', description: '【景品/2】' };
  const route = resolveCalendarRoute(event, [normal, giveaway], {});

  assert.equal(route.monitor.id, giveaway.id);
  assert.equal(route.type, 'giveaway');
  assert.equal(route.source, 'legacy');
  assert.equal(calendarDisplaySummary(event, route), '旧方式の抽選');
});

test('unmanaged calendar entries are ignored', () => {
  const event = { summary: '個人的な予定', description: '' };
  assert.equal(resolveCalendarRoute(event, [normal, giveaway], {}), null);
});
