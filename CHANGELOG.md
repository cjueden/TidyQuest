# Changelog

What changed in each release of this fork, in plain language, newest first. Releases before v0.7.0 are
upstream TidyQuest's: see [RELEASE-NOTES.md](RELEASE-NOTES.md).

**Adding to it:** every pull request adds its lines under **Unreleased** (in Added, Changed or Fixed).
`scripts/release.sh X.Y.Z` turns Unreleased into that version's section and uses it as the GitHub release notes
(see [RELEASING.md](RELEASING.md)).

## Unreleased

### Added
- **A Time zone setting.** Settings → General → Time zone (parents): days start at midnight there for the whole
  family, so chores, streaks, weekly goals, the Board, reward limits, reminders, quiet hours and Insights all count
  home days. Search the list or tap "Use this device's zone". A new install takes the zone from the first parent's
  browser. An existing install keeps using the server's `TZ` until a parent picks a zone, and Settings offers this
  device's zone when it's different. Changing it moves when each day starts from then on: chores already done stay
  on their days, and a weekly goal that's running moves to the new zone's week. The server no longer needs `TZ`.
- **Log out everywhere.** Profile → "Log out everywhere else" signs you out on every other phone, tablet and
  computer and keeps you signed in on this one. Parents can sign one person out on all their devices (Settings →
  Family Members → Manage member → "Log out of all devices"), e.g. for a lost tablet.
- **"Forgot password?" on the login screen.** It opens a short note: ask a parent to set a new password in
  Settings → Family Members, and if no parent can log in, whoever runs the server can reset the first parent's
  password (with a link to the README's steps). No email needed.

### Changed
- A new password signs that person out on every device. Changing your own keeps you signed in where you changed it;
  when a parent resets a kid's password, the kid's tablet is signed out too and needs the new one. Logins from
  before this version keep working until then.
- A phone or computer in another time zone (a parent on a trip) still counts home days: today's chores, due dates,
  the Calendar, History, Insights and "Done earlier…" follow the family's zone. Coin boost start and end times are
  typed and shown in home time.

### Fixed
- A goal's end date now ends at midnight at home. It used to end at midnight UTC, which is late afternoon in the
  Americas.
- Home's "streak done today" and the earliest vacation end date no longer use the UTC date, which is already
  tomorrow on an American evening.
- The streak check for a missed day looks at the end of the family's day, not the end of the UTC day.
- Typing the wrong current password when changing yours no longer signs you out.
- Home's House Health card: tapping Rooms or Tasks opens that page, and tapping Critical opens the task list showing
  only the chores under 30% health (a new "Critical" choice in the task list's status filter). They looked like
  buttons but did nothing.
- On the Rooms page, tapping a chore on a room's card opens the room scrolled to that chore and flashes it, instead of
  opening the room at the top.
- The guide now says the right thing about passwords after importing a backup: people who already have an account on
  this server keep their passwords, and only people new to it need one from a parent.

## v0.12.0 (2026-10-24)

### Added
- **Pick the day the week starts.** Settings → General → Week starts on: Monday (as before) or Sunday. Weekly
  goals, the Board (this week, last week, the team goal and past winners), weekly reward limits, rotating rewards,
  "per week" chore turns, weekly badges, Insights, the Calendar and History's "This week" all follow it. A weekly
  goal that's running moves to the new week when you switch.

### Changed
- The weekly recap covers the week that just ended when it goes out on the week's first day (for example, Sunday
  evening for a family whose week starts on Sunday).

### Fixed
- On a computer, the chore editor's options (Timer, Steps, Effort, Allow early completion) no longer run off the
  right side of the card: that row wraps now, in Add Task too.
- On phones, a chore's ⋯ menu no longer hangs off the left edge of its card.
- A room's page no longer scrolls sideways on laptops. On a wide screen the chore table's columns share the space,
  so names and descriptions get room to breathe. On a narrower one each chore shows its name on top, its details on
  a line below and its buttons at the right; the column names stay above as sort buttons.
- Page titles no longer push the Search, coins and streak badges off the side on narrow computer windows; the
  badges move under the title instead.
- In kid mode, the room table's column names line up with the chores again.

## v0.11.1 (2026-10-21)

### Added
- **Pause a chore.** ⏸️ Pause in a chore's ⋯ menu (or the "⏸️ Paused" tick in the chore editor) takes it off
  everyone's lists without deleting it. Pick an optional "Back on" day and it switches itself back on; ▶️ Switch
  back on does it by hand. It comes back as if just done. Parents see paused chores greyed at the end of their room.
- **Hide a reward.** Hide / Show in Settings → Rewards Catalog takes a reward out of the shop and keeps it for
  later. Hidden rewards are greyed at the end of the list.
- **Log a chore late.** "Done earlier…" next to Done logs a chore for yesterday or another day in the past week. It
  counts on that day for streaks, the weekly goal, the Board and the Calendar. A kid's late log always waits for a
  parent. It pays the chore's normal coins, without double coins or the Rescue Mission. Activity tags it "logged
  late".
- **Insights: compare people.** Tap a name in a chart's legend to hide or show that person's data (for example,
  only the twins). Colors stay with each person, and totals count only who's shown.

### Fixed
- Insights bars no longer stay dimmed after the mouse leaves the chart. Pointing at a bar previews it; a click or
  tap pins it, and tapping it again or anywhere outside the chart lets go.
- "Waiting for approval" stays on a parent's Home while Strict Mode is on, and says "No chores waiting for
  approval." when it's empty.

## v0.11.0 (2026-10-20)

### Added
- **🛡️ Streak shields** cover a missed day so a streak keeps going. Earned every 7th day of a streak, bought in the
  shop or given by a parent.
- **Insights for parents:** when chores get done, busy and quiet times, who does how much, skipped and late chores,
  and coins in and out, with a date picker and a custom date range.

## v0.10.1 (2026-10-18)

### Added
- Monthly chores, on a day of the month or a day like "first Saturday".
- A "Starts on" date for repeating chores.

### Changed
- Due dates show the weekday ("Sat, Nov 7").

## v0.10.0 (2026-10-18)

### Added
- A countdown timer on chores.
- One thing at a time (Focus).
- Rearrange Home by drag and drop, saved per person.
- The guide in six languages.

### Fixed
- The Troubleshooting link scrolls to its section.

## v0.9.6 (2026-10-18)

### Added
- Undo a snooze.
- "Call off team-up".
- Tap a double coins event to see its chores.

### Fixed
- Cancel no longer fails on shared (chipped-in) reward requests.
- Actions that failed silently now show an error.

## v0.9.5 (2026-10-18)

### Changed
- Deleting a chore or room keeps its history.
- Clearer chore row buttons: no ×, a bigger ⋯, and Done set apart.
- ↩️ Undo asks to confirm.
- Deleting a room says how many chores it has.
- "See all" for reward requests.
- The guide explains adjusting coins.

## v0.9.4 (2026-10-18)

### Added
- Decline a team-up.
- Refund a reward.
- Take back a Done that's still waiting for approval.
- Reject with undo and a reason.
- Adjust parents' coins.

### Fixed
- Team-up undo.
- The login limit.

## v0.9.3 (2026-10-17)

### Added
- Swap mascots.

### Fixed
- The egg in the mascot shop.
- The Settings layout.

## v0.9.2 (2026-10-16)

### Added
- More to do with the house mascot.

## v0.9.1 (2026-10-16)

### Added
- Guide & help in Settings.

## v0.9.0 (2026-10-16)

### Added
- Cheers.
- Unlockables: titles and gold-tier badge frames.
- A house mascot that hatches and grows with the family's coins.
- Team-ups on a chore.
- More chore icons.

## v0.8.0 (2026-10-16)

### Added
- Double coins on chosen chores.

### Fixed
- Chip-ins start at 0, and Activity shows every chip-in.

## v0.7.0 (2026-10-16)

The first release of this fork.

### Added
- Seasonal styling: holiday decorations and colors, which can be turned off.
- Search and filters: a Tasks page, header search (/ or Ctrl+K), and filters on Rewards and Activity.
- One-time chores with a To-do card and "+ To-do", the "Your usual" and "Maybe you forgot" cards, and the Rescue
  Mission (today's most-forgotten chore pays extra).
- A Features card in Settings to switch the extras on or off.
- A family Board, achievements, notifications per person, and a theme per person.
- Settings shows the running version.

### Fixed
- Many fixes from the first review: badges that disappeared, the weekly goal rolling over, custom coins on the room
  page, tapping and scrolling, approvals, backups, coins, rewards and goals, scheduling, and setup.
