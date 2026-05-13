import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaNeon } from '@prisma/adapter-neon'

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL!,
})

const prisma = new PrismaClient({ adapter })

async function main() {
  await prisma.property.upsert({
    where: { propertyCode: "villa-b1" },
    update: {},
    create: {
      propertyCode: "villa-b1",
      name: "Villa B1",
      location: "Assagao, North Goa",
      bedrooms: 3,
      maxGuests: 6,
      privatePool: true,
      checkInTime: "2pm",
      checkOutTime: "11am",
      baseRatePerNight: 18000,
      baseGuestCount: 4,
      extraGuestCharge: 2000,
      wifiPassword: "Nistula@2024",
      caretakerAvailability: "8am to 10pm",
      chefOnCall: true,
      chefBookingRequired: true,
      cancellationPolicy: "Free up to 7 days before check-in"
    }
  });

  console.log("✅ Seeded property: Villa B1");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
