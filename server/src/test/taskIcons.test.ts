import { describe, it, expect } from 'vitest';
import { suggestTaskIcon } from '../utils/taskIcons';

describe('Icon suggestions for family activities', () => {
  it("picks a fitting icon for the family's chores, before the room-by-room rules", () => {
    const cases: Array<[string, string]> = [
      ['Morning Feeding: 3 dogs + 2 cats', 'petfood'], ['Scoop the Litter Boxes', 'litter'], ['Dog Poop Patrol (yard)', 'poop'],
      ['Wash Pet Bowls', 'petfood'], ['Wash Dog & Cat Beds', 'petbed'], ['Flea/Tick & Heartworm Meds', 'petmeds'],
      ['🐕 Walk the Dogs (20+ min)', 'leash'], ['🐾 Brush or Bathe a Dog', 'dog'], ['Skim Pool & Empty Skimmer Baskets', 'skimmer'],
      ['🏊 Scrub the Pool Tile Line', 'pool'], ['Water Potted Plants', 'wateringcan'], ['Mow the Lawn', 'mower'], ['Garden hose away', 'hose'],
      ['Test Smoke & CO Alarms', 'smokealarm'], ['Replace Smoke Alarm Batteries', 'smokealarm'], ['Replace HVAC Filter', 'airfilter'],
      ['Whole house water filter', 'waterfilter'], ['Check Fire Extinguishers', 'extinguisher'], ['🚗 Wash the Cars', 'carwash'],
      ['30 mins bill paying sesh 🙌', 'bills'], ['Grocery Run', 'groceries'], ['Get to Work on Time ⏰', 'alarmclock'], ['Made the Bus 🚌', 'bus'],
      ['🏆 Report Card: Each A', 'reportcard'], ['🔥 Win Streak Bonus (2+ weeks in a row)', 'streak'], ['🏆 Weekly Win (parent awards)', 'trophy'],
      ['⭐ Caught Being Awesome', 'star'], ['Homework: done & in the folder', 'homework'], ['Bedtime Routine: shower · teeth · backpack', 'bedtime'],
      ['Morning Launch: teeth · hair · covers up', 'toothbrush'], ['Fold & Put Away Towels', 'folding'], ['📚 All Homework Turned In This Week', 'homework'], ['Set & Clear the Table', 'table'],
      // The old rules still apply to everything else
      ['Clean Shower & Tub', 'shower'], ['Make the Bed', 'bed'], ['Wipe Kitchen Counters', 'counter'], ['Empty the Dishwasher', 'dishes'],
    ];
    expect(cases.map(([name]) => [name, suggestTaskIcon(name)])).toEqual(cases);
  });
});
