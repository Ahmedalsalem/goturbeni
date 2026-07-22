-- The original unique index scoped "one review per reviewer per ride" —
-- but a driver with several approved passengers on the same ride only gets
-- to leave ONE review total for that ride (whichever passenger they review
-- first), permanently locking out reviewing the others. The intended rule
-- (already what the "insert own review" RLS with-check enforces alongside
-- this index) is one review per (ride, reviewer, reviewee) triple, not per
-- (ride, reviewer).
drop index public.reviews_one_per_reviewer_per_ride;

create unique index reviews_one_per_reviewer_per_reviewee_per_ride
  on public.reviews (ride_id, reviewer_id, reviewed_user_id);
