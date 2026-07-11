/**
 * Seed Script: Create Master SuperAdmin
 * =====================================
 * Usage: node scripts/seedSuperAdmin.js
 *
 * This script creates a master superadmin account if one doesn't already exist.
 * Run this once after setting up your .env file.
 */

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../model/user');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// ─── Seed Config (Change these as needed) ────────────────────────────────────
const SEED_USER = {
    fullName: 'WA Flow Admin',
    email: 'admin@waflow.com',
    password: 'Admin@123',
    phone: '+919999999999',
};
// ─────────────────────────────────────────────────────────────────────────────

async function encryptPassword(password) {
    const CryptoJS = require('crypto-js');
    const secret = process.env.CRYPTO_SECRET_KEY;
    if (!secret) throw new Error('CRYPTO_SECRET_KEY is not set in .env');
    return CryptoJS.AES.encrypt(password, secret).toString();
}

async function run() {
    console.log('\n🚀 WA Flow — Master SuperAdmin Seed Script');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (!process.env.MONGO_URI) {
        console.error('❌ MONGO_URI is not set in .env file.');
        console.error('   Please create your .env file from .env.example first.\n');
        process.exit(1);
    }

    console.log('📡 Connecting to MongoDB...');
    await connectDB();

    try {
        // Check if user already exists
        const existing = await User.findOne({ email: SEED_USER.email });
        if (existing) {
            console.log(`⚠️  A user with email "${SEED_USER.email}" already exists.`);
            console.log(`   Name:     ${existing.fullName}`);
            console.log(`   Role:     ${existing.role}`);
            console.log(`   Master:   ${existing.isMaster}`);
            console.log(`   Status:   ${existing.status}`);

            // Ensure it is marked as master
            if (!existing.isMaster) {
                existing.isMaster = true;
                await existing.save();
                console.log('\n✅ Updated existing user to isMaster = true');
            } else {
                console.log('\n✅ User is already a master superadmin. No changes made.');
            }
        } else {
            // Encrypt password using same method as the app
            const encryptedPassword = await encryptPassword(SEED_USER.password);

            const user = await User.create({
                fullName: SEED_USER.fullName,
                email: SEED_USER.email,
                phone: SEED_USER.phone,
                password: encryptedPassword,
                role: 'superadmin',
                status: 'active',
                isMaster: true,
            });

            console.log('✅ Master SuperAdmin created successfully!\n');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('  🔐 Login Credentials');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`  Name:     ${user.fullName}`);
            console.log(`  Email:    ${SEED_USER.email}`);
            console.log(`  Password: ${SEED_USER.password}`);
            console.log(`  Phone:    ${SEED_USER.phone}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('\n  🌐 Login URL: http://localhost:3001/superadmin/login\n');
            console.log('  ⚠️  Please change your password after first login!\n');
        }
    } catch (err) {
        console.error('\n❌ Error creating superadmin:', err.message);
        if (err.code === 11000) {
            console.error('   Duplicate key error — a user with this email or phone already exists.');
        }
    } finally {
        await mongoose.connection.close();
        console.log('🔒 Database connection closed.\n');
    }
}

run();
