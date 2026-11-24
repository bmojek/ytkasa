# Licznik filmów i TikToków

Wspólny licznik linków do filmów i TikToków. Wszyscy odwiedzający korzystają z tej samej bazy Firebase; nie ma rejestracji ani kont użytkowników.

## Konfiguracja

1. Skonfiguruj projekt Firebase z aplikacją webową i bazą Cloud Firestore.
2. W Firebase Authentication włącz dostawcę **Anonimowe**. Użytkownicy nie muszą się logować — aplikacja łączy się anonimowo, aby uzyskać dostęp do wspólnej bazy.
3. Opublikuj w Firebase Firestore reguły z pliku `firestore.rules`.
4. Skopiuj `.env.example` do `.env.local` i uzupełnij publiczne ustawienia Firebase.
5. Zainstaluj zależności i uruchom:

   ```bash
   npm install
   npm run dev
   ```

Wartości w `.env.local` mogą być bez cudzysłowów. Jeśli aplikacja pokazuje `auth/configuration-not-found` lub `auth/operation-not-allowed`, włącz dostawcę **Anonymous** w Firebase Console → Authentication → Sign-in method (albo Sign-in providers), zapisz ustawienie i odśwież aplikację. Po zmianie `.env.local` uruchom ponownie serwer Next.js.

## Funkcje

- Wspólna lista filmów i TikToków widoczna dla wszystkich.
- Dodawanie wielu linków naraz, po jednym w linii.
- Stawki: 100 zł za film i 30 zł za TikToka.
- Historia okresów jest widoczna na stronie głównej dla wszystkich; okresy można wznawiać bez kasowania historii.
- Panel `/admin` nie ma odnośnika w interfejsie. Otwiera się go bezpośrednio przez adres i hasło `user`; sesja wygasa po 12 godzinach.

Baza jest celowo wspólna: anonimowi odwiedzający mogą dodawać wpisy. Reguły Firestore nie rozróżniają poszczególnych odwiedzających. Hasło `user` jest celowo wpisane w kod serwera i nie jest silnym zabezpieczeniem; panel ukrywa widok rozliczeń, ale nie czyni wspólnych danych Firestore prywatnymi.
