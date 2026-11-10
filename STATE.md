# Állapot

Frissítve: 2026-11-06. Egy oldal: a `/agentic-code:save-work` írja újra, a `/agentic-code:resume-work` olvassa először.

## Mi ez
Helyi, titkosított személyes pénzügyi app (Expo / React Native). A `feat/statistics-months` ágon a verzió 1.4.0 (versionCode 8), a `main`-en 1.3.1 (versionCode 7). A Play-en az 1.3.0 (versionCode 6) van kint, ez Android 14+-on összeomlik (B23, az 1.3.1 javítja).

## Most
- **Statisztika hónapokra bontva: PR #10** (`feat/statistics-months` → `main`), nyitott. Spec: `docs/specs/2026-11-06-statistics-months.md`, minden feladat kész.
  - Áttekintő: 12 havi oszlopok, hónaplista, alul a „Balance over time” (alapból nyitva).
  - Hónapnézet: bevétel/kiadás csempe, 12 havi átlag, hónap végi egyenleg, lebontás; a lebontásból lefúrás a History-ba.
  - Gyula telefonján dev builddel, teszt-vaulttal kipróbálva: minden rendben, egyetlen kérés volt (a vonaldiagram alapból nyitva), ez megvan.
- **B24 javítva** ugyanebben a PR-ban: az „Outside Jar” egyenlegvonal kezdőpontja hibás volt.
- **Új tesztréteg:** a repó-SQL tesztjei valódi `node:sqlite`-on futnak (`docs/decisions.md`, 2026-11-06).
- **1.4.0 AAB kész:** `tarcak-1.4.0.aab` a projektmappában (gitignore-olt). Csomagnév `com.gyulaa.tarcak`, versionName 1.4.0, versionCode 8, a `DETECT_SCREEN_CAPTURE` benne. A PR #10 ágáról épült.
- **Telefon:** fent van a dev build is (`com.gyulaa.tarcak.dev`, külön adatokkal, teszt-vault), az éles app mellett. Törlés, ha nem kell: `adb uninstall com.gyulaa.tarcak.dev`.
- Az 1.3.1 AAB (versionCode 7) feltöltése nem ismert; ha még nem ment fel, elég az 1.4.0-t feltölteni.

## Ágak
- `feat/statistics-months`: PR #10, pusholva.
- `main`: a PR #1–#9 merge-elve.

## Build (Linux)
- JDK 17: `/opt/dev/jdk17` (`JAVA_HOME`; a rendszer JDK 25-tel a Gradle 9.0 nem fut), Android SDK: `~/Android/Sdk`, adb: `~/Android/Sdk/platform-tools/adb`.
- **Éles AAB helyben:** `ANDROID_HOME=~/Android/Sdk JAVA_HOME=/opt/dev/jdk17 npx eas-cli@27 build -p android --profile production --local --non-interactive --output ./tarcak-<verzió>.aab` (~6 perc). Az EAS emeli a versionCode-ot az `app.json`-ban: utána commitolni. EAS-belépés: `npx eas-cli@27 login`.
- **Dev build a telefonra:** az `android/` (ignorált) most a 11-04-es prebuild, a debug blokkban `applicationIdSuffix ".dev"`. Lépések:
  1. Az `android/`-ban: `./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a`.
  2. `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.
  3. `adb reverse tcp:8081 tcp:8081`.
  4. `npx expo start --localhost --dev-client`.

  Natív változás után előbb `npx expo prebuild --platform android --no-install`, és utána a suffixet vissza kell tenni.
- **Release teszt-APK:** ugyanígy, a release blokkban `applicationIdSuffix ".crashtest"`, `assembleRelease`. Kiadás előtt ezzel a telefonon indítani (B23 tanulsága).

## Blokkol / várunk
- Gyula: a PR #10 átnézése és merge-e; az 1.4.0 AAB feltöltése a Play Console-ba; az 1.3.0 rolloutjának leállítása, ha még fut.

## Következő lépés
1. PR #10 merge után: `git fetch`, a `main` tartalmazza-e (`git merge-base --is-ancestor`).
2. Kis takarítás: az `app.json`-ból a `newArchEnabled` törlése (SDK 55-ben mindig be van kapcsolva).
3. **Tétel nevének automatikus kiegészítése** a tranzakcióűrlapon (korábbi tételnevek gépelés közben, kategória/zseb ajánlással); `spec` skill-lel kezdd.
4. Havi export: a 6. feladat eszközön. Kézenfekvő: a `getReportRows`-t átírni az új egylekérdezéses mintára (`monthsCteSql`).
5. B22 (alacsony): a History szűrőchipjén a „×” iOS VoiceOverrel nem érhető el.
6. Később, a statisztikához: állítható hónapkezdő nap (fizetésnap), észrevételek (most kihagyva).

## Súrlódás
- A pre-commit check a teljes munkafát típusellenőrzi (egyszer, kb. 2 perc).
- Az egymásra épülő PR-ok a saját alap-águkba olvadtak (egyszer). Minden PR a `main`-re menjen.
- Új natív függőség után a dev build elavult volt (egyszer, kb. 15 perc).
- Vizuális hibák csak a telefonon derültek ki (egyszer, kb. 10 perc). Vizuális változás után azonnal eszközön nézni.
- Az app-konfiguráció csak release buildben érvényesül; kiadás előtt release APK a telefonon.
- A helyi Android-build első futása kb. 30 perc volt (JDK, NDK); most rendben.
- A pre-commit hook nem volt bekapcsolva ebben a klónban (`core.hooksPath` üres), így egy commit ellenőrzés nélkül ment, és egy részleges `git add` miatt egy köztes commit nem fordult; rebase kellett (egyszer, kb. 5 perc). Klónozás után: `git config core.hooksPath .githooks`, és a commit előtt `git status --short`.
