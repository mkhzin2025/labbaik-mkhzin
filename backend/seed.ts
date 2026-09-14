import axios from 'axios';
import * as bcrypt from 'bcrypt';

const API_URL = 'http://localhost:3000';

const testUser = {
  email: 'admin@labbaik.local',
  password: 'Admin123!',
  fullName: 'Admin',
};

async function seed() {
  try {
    console.log('🌱 Starting database seed...');
    console.log(`📝 Creating test user: ${testUser.email}`);

    // Register test user
    const response = await axios.post(`${API_URL}/auth/register`, testUser, {
      timeout: 5000,
    });

    console.log('✅ Test user created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log(`   Email: ${testUser.email}`);
    console.log(`   Password: ${testUser.password}`);
    console.log(`\n🌐 Frontend: http://localhost:5173/login`);
    console.log('✨ Seed completed!\n');
  } catch (error: any) {
    if (error.response?.status === 400 || error.response?.data?.message?.includes('already')) {
      console.log('✅ Test user already exists');
      console.log('\n📋 Login Credentials:');
      console.log(`   Email: ${testUser.email}`);
      console.log(`   Password: ${testUser.password}`);
      console.log(`\n🌐 Frontend: http://localhost:5173/login`);
    } else {
      console.error('❌ Seed failed:', error.message);
      process.exit(1);
    }
  }
}

seed();
