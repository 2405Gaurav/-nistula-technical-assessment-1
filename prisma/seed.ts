import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {

    await prisma.property.create({
        data: {
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

    console.log("Seeded property");

}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });