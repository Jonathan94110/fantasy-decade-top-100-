# Fantasy byes start in Week 5

Both new Strict and Historical seasons have bye-free Fantasy Weeks 1–4.
Version 3 bye schedules assign one fictional rest per player, kicker and franchise
defense, starting in Fantasy Week 5. The existing last-week boundary is unchanged:
assignments end before the final regular-season week, and never enter playoffs.
Actual historical NFL bye dates are not used.

An unfinished saved draft or season receives a deterministic repair of unplayed
assignments in Weeks 1–4. Legal later dates already assigned remain unchanged.
Migration keeps picks, draft order, rosters, lineup IDs, locks, scoring contracts,
completed receipts, totals and consumed-performance ledgers intact. It does not
reset a draft or select any new historical performance.

An unresolved early current round can move its rest assignments even if a lineup
is locked: locking has not drawn a performance yet. Recorded or elapsed rests
remain historical and do not give that player a second bye. Review/completed
records are preserved. Migration checks both starter and bench bye receipts.

The existing anti-crowding guard requires at least four untouched legal weeks.
If a legacy six-week format or late migration cannot provide that window, affected
unplayed assignments are deferred instead of crowding a season into one to three
bye weeks. Completed and protected assignments remain as recorded. UI explains
this exception; it does not promise a new rest for every player in those seasons.
Modern 17-week seasons have sufficient regular-season space for one rest each.

Availability is determined from the current fantasy week. Week 4 remains playable
and may show “Available · Bye next week” for a Week 5 rest. In Week 5 that same
assignment becomes “BYE THIS WEEK”. Keeping a bye starter still requires explicit
acknowledgement, scores zero and consumes no historical game. Roster, free-agent
and depth-chart badges share these boundaries; no player bye applies in playoffs.

The local preview stays running. Jonathan subsequently authorized publication
to the existing owner-private Site as part of the unified draft update. Regression, actual-browser
fixture and local build evidence is retained outside the checkout under
`../research/bye-week-five/`.
