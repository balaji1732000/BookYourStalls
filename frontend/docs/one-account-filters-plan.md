# BookYourStall Production-Grade One-Account Marketplace Plan

Goal: make BookYourStall production-ready, not MVP-only. The app must behave like a marketplace: one member account can create events, book stalls, manage conducted events, and act as organiser/vendor contextually.

Product decisions confirmed by Balaji:
1. Change base account role to `member`.
2. Event creation should not require organiser account type. A member becomes organiser for events they conduct.
3. Booking completion must show a tick/success confirmation like food delivery order submitted, then redirect to all events conducted by the user.
4. Add allowed vendor categories now.
5. Event categories must be multi-select, not single-select.
6. This should be production-grade because release is soon.

Current root cause from live code:
- Booking flow was partly changed to allow any logged-in user.
- Create Event is still role-gated in frontend: `src/App.tsx` uses organiser/super_admin checks and shows `Please login as organizer before creating events.`
- Create Event is still role-gated in backend: `book-your-stall-backend/app/routers/events.py` uses `Depends(require_role("organizer", "super_admin"))`.
- Register/auth still exposes fixed roles and backend schema accepts only `organizer|vendor|super_admin`.
- Event category is currently a single string.
- Allowed vendor categories do not exist as first-class event data yet.

Production product model:
- Account role: `member` for all normal users.
- Admin role: `super_admin` only for internal/admin operations.
- Contextual organiser: a member is organiser for events where `event.organizer_id == user.id`.
- Contextual vendor/exhibitor: a member is vendor/exhibitor for bookings they create or manual bookings created for their business.
- UI must not ask users to choose Vendor/Organizer at registration.

Acceptance criteria:
1. Register creates `member` users by default.
2. Login/header displays member name, not vendor/organizer role label.
3. Any active member can create an event.
4. Event `organizer_id` is set to current user ID.
5. Event owner sees organiser tools for their conducted events.
6. Any active member can request/book stalls in published events.
7. Event category is multi-select.
8. Allowed vendor categories are multi-select and saved with event.
9. Home filters support category, vendor category, crowd type, expected footfall range, city, and stall price range.
10. Booking success shows a dedicated success state with large tick ✅, booking reference, summary, and redirect CTA.
11. After booking success, user is redirected to `My Conducted Events` / `My Events` area as requested.
12. No UI text should say `Please login as organizer` or `Please login as vendor`.
13. All changes covered with backend and frontend tests.
14. Database migration/backfill strategy exists for current vendor/organizer users.

Recommended production navigation:
- Explore
- Saved
- Create
- My Events
- Menu

If keeping current 3-tab bottom nav temporarily:
- Home
- Saved
- Menu
But top plus remains Create.
Add `My Events` from Menu and after booking success.

Data model changes:

Users:
- Existing roles: organizer, vendor, super_admin.
- New roles: member, super_admin.
- Backfill existing organizer/vendor users to member, unless super_admin.
- Preserve super_admin.

Events:
- Current `category: string` should become multi-select.
Recommended fields:
- `categories: list[str]` or JSON column.
- `allowed_vendor_categories: list[str]` or JSON column.

Backward compatibility:
- During migration, convert existing `category` string into `categories: [category]`.
- Frontend can display first category as primary, but filter should match any category.

Bookings:
- Current booking can stay linked to user/member ID.
- Consider renaming `vendor_id` to `member_id` or `booked_by_user_id` for correctness.
- If renaming now is too large, keep DB column for compatibility but expose frontend language as `member` or `business contact`, not vendor account.

Product options:

Event categories, multi-select:
- Shopping expo
- Fashion pop-up
- Flea market
- Thrift/vintage market
- Food festival
- Handmade/craft fair
- Lifestyle expo
- Kids/family event
- College fest
- Apartment/community event
- Business expo
- Wedding/lifestyle expo
- Festival bazaar
- Night market
- Startup/business expo
- Art/design fair
- Home decor expo
- Beauty/wellness expo

Allowed vendor categories, multi-select:
- Clothing
- Thrift/vintage clothing
- Accessories
- Jewellery
- Footwear
- Bags
- Beauty/skincare
- Home decor
- Handmade/crafts
- Art/prints
- Food/snacks
- Beverages
- Desserts
- Kids products
- Toys
- Books/stationery
- Plants
- Pet products
- Gifting
- Electronics/accessories
- Services
- NGO/community stalls

Crowd type options:
- Families
- Women shoppers
- College students
- Working professionals
- Kids and parents
- Premium/luxury crowd
- Food lovers
- Startup/business visitors
- Local community
- Mixed crowd

Expected footfall ranges:
- Any footfall: no min/max
- Under 1,000: max 999
- 1,000 - 5,000: min 1000, max 5000
- 5,000 - 10,000: min 5000, max 10000
- 10,000 - 25,000: min 10000, max 25000
- 25,000 - 50,000: min 25000, max 50000
- 50,000+: min 50000

Stall price ranges:
- Any price: no min/max
- Under ₹5,000: max 4999
- ₹5,000 - ₹10,000: min 5000, max 10000
- ₹10,000 - ₹25,000: min 10000, max 25000
- ₹25,000 - ₹50,000: min 25000, max 50000
- ₹50,000+: min 50000

Cities:
- Chennai
- Coimbatore
- Bangalore
- Hyderabad
- Mumbai
- Delhi NCR
- Pune
- Kochi
- Madurai
- Trichy
- Salem
- Erode
- Tirupur
- Pondicherry

Implementation tasks:

Task 1: Backend role model migration to member
Files:
- book-your-stall-backend/app/models.py
- book-your-stall-backend/app/schemas.py
- book-your-stall-backend/app/routers/auth.py
- book-your-stall-backend/tests/test_api_flow.py
Steps:
1. Add/update tests: registration without role creates role `member`.
2. Change UserCreate schema so role is optional/default `member` or removed from public register payload.
3. Allow user role pattern `member|super_admin`; keep temporary compatibility for legacy organizer/vendor during migration if needed.
4. Update seed/test users to use member for normal test accounts.
5. Backfill existing DB users: organizer/vendor → member, super_admin unchanged.
6. Verify auth/me returns member.

Task 2: Backend allow any active member to create event
Files:
- book-your-stall-backend/app/routers/events.py
- tests/test_api_flow.py
Steps:
1. Add test: member login can POST /api/v1/events and response organizer_id equals member ID.
2. Replace create_event dependency from `require_role("organizer", "super_admin")` to `CurrentUser`.
3. Keep update/publish/cancel/stall generation owner-only using `organizer_id == current_user.id` or super_admin.
4. Error language should say owner-only, not organizer-role-only.

Task 3: Backend multi-category event schema
Files:
- app/models.py
- app/schemas.py
- app/routers/events.py
- tests/test_api_flow.py
Steps:
1. Add `categories` and `allowed_vendor_categories` fields.
2. Use JSON column/list if current DB supports it; otherwise text field storing JSON safely.
3. Update EventCreate/EventRead/EventUpdate schemas.
4. Convert existing `category` to `categories` for backward compatibility.
5. Update list_events filters to match any selected category and any vendor category.
6. Tests: create event with multiple categories and allowed vendor categories; filter by each category returns event.

Task 4: Frontend public auth/register cleanup
Files:
- src/App.tsx
- src/lib/api.ts
- src/types.ts
- src/App.test.tsx
Steps:
1. Remove role selector from register form.
2. Register payload should not require role.
3. Header should display only user name, not `member` role label.
4. Replace all vendor/organizer login error text with generic login/member text.
5. Tests for no role selector and no old role-gate error.

Task 5: Frontend create-event production form
Files:
- src/productOptions.ts new
- src/App.tsx
- src/types.ts
- src/App.test.tsx
Steps:
1. Add product option constants.
2. Category becomes multi-select checkbox/chip UI.
3. Allowed vendor categories becomes multi-select checkbox/chip UI.
4. Crowd type becomes dropdown/chips from options.
5. City uses suggestions but allows typing custom city.
6. Expected footfall stays exact numeric input for event creation.
7. Create event auto-publishes after create unless product later wants setup draft flow.
8. Tests cover multiple category payload and allowed vendor category payload.

Task 6: Frontend explore filters
Files:
- src/App.tsx
- src/lib/api.ts
- src/productOptions.ts
- src/App.test.tsx
Steps:
1. Home filter category uses eventCategories multi-select or dropdown.
2. Add allowed vendor category filter.
3. Add crowd type filter.
4. Add expected footfall range filter mapped to min_footfall/max_footfall.
5. Add stall price range filter mapped to min_stall_price/max_stall_price.
6. Ensure query params sent correctly.

Task 7: Booking success experience
Files:
- src/App.tsx
- src/App.test.tsx
- src/index.css
Steps:
1. After createBooking success, show a dedicated success card/state.
2. UI should have large tick ✅ / check icon, `Booking request submitted`, booking reference, business name, stall package, and next-step copy.
3. Add CTA `View my conducted events` or `Go to My Events`.
4. Auto-redirect after short delay only if it does not confuse users; otherwise show primary CTA. Product request says redirect to all events conducted by the user, so implement redirect after success with visible confirmation.
5. Add route `/my-events` listing events where current user is organizer_id.
6. If the user has no conducted events, show empty state and CTA to create event.

Task 8: My Events / conducted events page
Files:
- Backend event route maybe supports `mine=true` or new `/events/mine`.
- Frontend route `/my-events`.
Steps:
1. Backend: add authenticated endpoint to list current user's events including drafts/published.
2. Frontend: show conducted events with status, stall count, bookings count if available.
3. Link from booking success and Menu.

Task 9: Production verification
Commands:
- Backend: `cd /home/highfleeopensourcenvs/book-your-stall-backend && .venv/bin/pytest -q`
- Frontend: `cd /home/highfleeopensourcenvs/book-your-stall-frontend && npm test && npm run build && npm run lint`
- Live smoke:
  1. Register new member.
  2. Create event with multiple categories and allowed vendor categories.
  3. Verify event visible on Home.
  4. Generate stall package.
  5. Book stall as same or another member.
  6. See success tick screen.
  7. Redirect to My Events.
  8. Verify filters by category/vendor category/crowd/footfall/price.

Pending clarification:
- User said point 5 but did not provide text. Need confirm if there is a fifth requirement.
