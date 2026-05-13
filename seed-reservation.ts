import "dotenv/config";
import { pool } from "./src/lib/db";

async function seed() {
  // find or create guest
  const guest = await pool.query(
    `SELECT id FROM guest WHERE fullname = 'Rahul Sharma' LIMIT 1`
  );
  let guestId: string;
  if (guest.rows.length > 0) {
    guestId = guest.rows[0].id;
  } else {
    const r = await pool.query(
      `INSERT INTO guest (fullname) VALUES ('Rahul Sharma') RETURNING id`
    );
    guestId = r.rows[0].id;
  }
  console.log("Guest ID:", guestId);

  // get property
  const prop = await pool.query(
    `SELECT id FROM property WHERE propertycode = 'villa-b1'`
  );
  const propId = prop.rows[0].id;
  console.log("Property ID:", propId);

  // seed reservation
  await pool.query(
    `INSERT INTO reservation (bookingref, guestid, propertyid, checkindate, checkoutdate, numberofguests, totalamount, paymentstatus, status)
     VALUES ('NIS-2024-0891', $1, $2, '2026-04-20', '2026-04-24', 2, 72000, 'paid', 'confirmed')
     ON CONFLICT (bookingref) DO NOTHING`,
    [guestId, propId]
  );

  const check = await pool.query(
    `SELECT * FROM reservation WHERE bookingref = 'NIS-2024-0891'`
  );
  console.log("Reservation:", check.rows[0]);
  process.exit(0);
}

seed();
