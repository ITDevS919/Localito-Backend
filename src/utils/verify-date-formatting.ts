/**
 * Verification script for date formatting
 * Run with: npx ts-node server/src/utils/verify-date-formatting.ts
 */

import { formatBookingDateTime } from './dateFormatting';

console.log('🧪 Testing formatBookingDateTime function...\n');

// Test cases
const testCases = [
  {
    name: 'Date object with time',
    date: new Date('2026-02-21'),
    time: '10:00:00',
    expected: 'Should contain "February 21, 2026" and "at 10:00"',
  },
  {
    name: 'ISO string with time',
    date: '2026-02-21T00:00:00.000Z',
    time: '10:00:00',
    expected: 'Should contain "February 21, 2026" and "at 10:00"',
  },
  {
    name: 'Date string (YYYY-MM-DD) with time',
    date: '2026-02-21',
    time: '10:00:00',
    expected: 'Should contain "February 21, 2026" and "at 10:00"',
  },
  {
    name: 'Time without seconds',
    date: '2026-02-21',
    time: '10:00',
    expected: 'Should contain "February 21, 2026" and "at 10:00"',
  },
  {
    name: 'Null date',
    date: null,
    time: '10:00:00',
    expected: 'Should return "at 10:00"',
  },
  {
    name: 'Null time',
    date: '2026-02-21',
    time: null,
    expected: 'Should return date only',
  },
  {
    name: 'Both null',
    date: null,
    time: null,
    expected: 'Should return empty string',
  },
];

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  try {
    const result = formatBookingDateTime(testCase.date as any, testCase.time as any);
    
    // Check for problematic strings
    const hasBadFormat = result.includes('00:00:00 GMT') || 
                         result.includes('Coordinated Universal Time') ||
                         result.includes('GMT+0000');
    
    if (hasBadFormat) {
      console.log(`❌ Test ${index + 1}: ${testCase.name}`);
      console.log(`   Result: "${result}"`);
      console.log(`   ERROR: Contains problematic timezone information!\n`);
      failed++;
    } else {
      console.log(`✅ Test ${index + 1}: ${testCase.name}`);
      console.log(`   Result: "${result}"`);
      console.log(`   Expected: ${testCase.expected}\n`);
      passed++;
    }
  } catch (error) {
    console.log(`❌ Test ${index + 1}: ${testCase.name}`);
    console.log(`   ERROR: ${error}\n`);
    failed++;
  }
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📊 Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('✅ All tests passed! Date formatting is working correctly.');
  console.log('✅ No "00:00:00 GMT+0000" or "Coordinated Universal Time" found.');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Please review the implementation.');
  process.exit(1);
}
