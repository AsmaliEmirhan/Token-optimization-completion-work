import { runClassificationTests } from './classification.test.js';
import { runCacheTests } from './cache.test.js';
import { runCostAndSecurityTests } from './costAndSecurity.test.js';
import { runL1FlowTests } from './l1Flow.test.js';

async function main() {
  console.log('===========================================================');
  console.log('   TOKENAI - L1 EXACT MATCH CACHE KAPSAMLI TEST SUITE');
  console.log('===========================================================');

  const start = performance.now();
  let totalPassed = 0;
  let totalFailed = 0;

  try {
    const classRes = await runClassificationTests();
    totalPassed += classRes.passed;
    totalFailed += classRes.failed;

    const cacheRes = await runCacheTests();
    totalPassed += cacheRes.passed;
    totalFailed += cacheRes.failed;

    const secRes = await runCostAndSecurityTests();
    totalPassed += secRes.passed;
    totalFailed += secRes.failed;

    const flowRes = await runL1FlowTests();
    totalPassed += flowRes.passed;
    totalFailed += flowRes.failed;

    const duration = ((performance.now() - start) / 1000).toFixed(2);

    console.log('\n===========================================================');
    console.log('                   TEST SONUÇLARI ÖZETİ');
    console.log('===========================================================');
    console.log(`Toplam Geçen Onay  : ${totalPassed}`);
    console.log(`Toplam Başarısız   : ${totalFailed}`);
    console.log(`Test Süresi        : ${duration} saniye`);

    if (totalFailed === 0) {
      console.log('\n🎉 TÜM TESTLER BAŞARIYLA GEÇTİ! SİSTEM KULLANIMA HAZIR.');
      console.log('===========================================================');
      process.exitCode = 0;
    } else {
      console.error('\n⚠️ BAZI TESTLER BAŞARISIZ OLDU.');
      console.log('===========================================================');
      process.exitCode = 1;
    }
  } catch (err: any) {
    console.error('\n💥 Test çalıştırması sırasında beklenmeyen hata:', err);
    process.exitCode = 1;
  }
}

main();
