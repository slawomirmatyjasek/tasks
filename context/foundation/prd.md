---
project: "Pilne"
version: 1
status: draft
created: 2026-09-04
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 1
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Osoba prowadząca kilka spraw jednocześnie po godzinach — zakupy, drobne naprawy, sprawy urzędowe, prywatne zobowiązania — zapisuje zadania z terminami, ale przy liście dłuższej niż kilkanaście pozycji traci orientację, które z nich wymagają działania _teraz_, a które mogą poczekać. Skutkiem jest przegapiony termin i poczucie, że lista zadań rośnie szybciej niż da się ją ogarnąć.

Samo sortowanie po dacie pokazuje kolejność, ale nie odpowiada na pytanie "co muszę zrobić dziś". Pojedynczy, automatyczny sygnał pilności — bez ręcznego oznaczania priorytetu — usuwa potrzebę skanowania każdej daty osobno.

## User & Persona

Kasia, 32 lata, koordynatorka projektów. Prowadzi prywatną listę spraw równolegle z pracą zawodową. Otwiera aplikację raz lub dwa razy dziennie, żeby w kilka sekund zdecydować, czym zająć się najpierw.

## Success Criteria

### Primary

- Użytkownik po otwarciu listy zadań od razu widzi, które zadania są pilne, bez ręcznego filtrowania czy sortowania.
- Każde zadanie z terminem w ciągu najbliższych 48h i nieoznaczone jako ukończone jest automatycznie oznaczone jako pilne.

### Secondary

- Użytkownik rzadziej przegapia terminy zadań (nie mierzone bezpośrednio w MVP).

### Guardrails

- Zadania jednego użytkownika nigdy nie są widoczne dla innego użytkownika.
- Oznaczenie zadania jako ukończone nigdy nie usuwa go bezpowrotnie w tle bez akcji użytkownika.

## User Stories

### US-01: Użytkownik dodaje zadanie z terminem

- **Given** zalogowany użytkownik
- **When** dodaje nowe zadanie podając tytuł i termin wykonania
- **Then** zadanie pojawia się na jego liście, posortowane po terminie

#### Acceptance Criteria

- Tytuł jest wymagany i niepusty
- Termin wykonania jest wymagany
- Nowe zadanie domyślnie ma status "nieukończone"

### US-02: Zadanie blisko terminu jest oznaczone jako pilne

- **Given** zadanie z terminem w ciągu najbliższych 48h, nieukończone
- **When** użytkownik przegląda listę zadań
- **Then** zadanie jest widocznie oznaczone jako "pilne"

#### Acceptance Criteria

- Próg pilności to dokładnie 48h liczone od bieżącego momentu
- Zadanie ukończone nigdy nie pokazuje flagi pilności, niezależnie od terminu
- Flaga jest wyliczana na bieżąco przy każdym wyświetleniu listy, nie zapisywana jako stała wartość

### US-03: Użytkownik oznacza zadanie jako ukończone

- **Given** istniejące zadanie należące do użytkownika
- **When** oznacza je jako ukończone
- **Then** znika z widoku aktywnych/pilnych zadań, a jego flaga pilności znika

#### Acceptance Criteria

- Ukończone zadanie pozostaje dostępne (np. w osobnym widoku), nie jest kasowane
- Można cofnąć oznaczenie ukończenia

### US-04: Użytkownik edytuje lub usuwa zadanie

- **Given** istniejące zadanie należące do użytkownika
- **When** zmienia tytuł lub termin, albo je usuwa
- **Then** zmiana jest trwale zapisana, a status pilności przeliczany na nowo

#### Acceptance Criteria

- Usunięcie zadania jest nieodwracalne i wymaga potwierdzenia
- Zmiana terminu natychmiast wpływa na flagę pilności przy kolejnym wyświetleniu

### US-05: Użytkownik widzi wyłącznie własne zadania

- **Given** zarejestrowany użytkownik
- **When** loguje się do aplikacji
- **Then** widzi wyłącznie zadania, które sam utworzył

#### Acceptance Criteria

- Niezalogowany użytkownik trafiający na ścieżkę listy zadań jest przekierowany do logowania
- Próba odczytu/edycji cudzego zadania kończy się odmową dostępu

## Functional Requirements

### Uwierzytelnianie

- FR-001: [Użytkownik] może zarejestrować się przy pomocy adresu email i hasła. Priority: must-have
- FR-002: [Użytkownik] może się zalogować i wylogować. Priority: must-have
- FR-003: [Niezalogowany gość] jest przekierowywany do logowania przy próbie wejścia na ścieżki zadań. Priority: must-have

### Zarządzanie zadaniami

- FR-004: [Użytkownik] może utworzyć zadanie z tytułem i terminem wykonania. Priority: must-have
- FR-005: [Użytkownik] może przeglądać listę własnych zadań. Priority: must-have
- FR-006: [Użytkownik] może edytować tytuł i termin istniejącego zadania. Priority: must-have
- FR-007: [Użytkownik] może usunąć zadanie. Priority: must-have
- FR-008: [Użytkownik] może oznaczyć zadanie jako ukończone lub cofnąć to oznaczenie. Priority: must-have

### Priorytetyzacja

- FR-009: [System] automatycznie oznacza zadanie jako pilne, gdy termin przypada w ciągu 48h i zadanie nie jest ukończone. Priority: must-have
- FR-010: [Użytkownik] może wyróżnić/przefiltrować pilne zadania na liście. Priority: nice-to-have

## Non-Functional Requirements

- Użytkownik widzi potwierdzenie utworzenia, edycji lub usunięcia zadania w ciągu 1 sekundy przy normalnych warunkach sieciowych.
- Nieudane logowanie nie ujawnia, czy dany adres email jest zarejestrowany w systemie.
- Dane zadań jednego użytkownika nie są dostępne dla innego użytkownika pod żadnym widokiem ani zapytaniem.
- Produkt pozostaje użyteczny na dwóch najnowszych wersjach głównych przeglądarek desktopowych i mobilnych.

## Business Logic

**Zadanie jest automatycznie oznaczane jako pilne, gdy jego termin wykonania przypada w ciągu najbliższych 48 godzin, a zadanie nie zostało jeszcze oznaczone jako ukończone.**

Reguła konsumuje dwa dane widoczne dla użytkownika: termin wykonania zadania oraz jego status ukończenia. Wynikiem jest pojedynczy, widoczny sygnał ("pilne") na liście zadań. Użytkownik napotyka go biernie — bez żadnej dodatkowej akcji — za każdym razem, gdy otwiera listę; sygnał jest przeliczany na nowo względem bieżącego czasu, nigdy nie jest wartością ustawianą ręcznie.

## Access Control

Aplikacja wieloużytkownikowa. Logowanie przez email + hasło (Supabase Auth). Jedna rola — właściciel zadań, bez ról administracyjnych czy współdzielenia w MVP. Niezalogowany użytkownik trafiający na dowolną ścieżkę zadań jest przekierowywany do logowania. Zalogowany użytkownik widzi, edytuje i usuwa wyłącznie zadania, które sam utworzył.

## Non-Goals

- Brak podzadań / hierarchii zadań — płaska lista, jedna encja danych.
- Brak przypomnień / powiadomień push — sygnał pilności widoczny tylko po otwarciu aplikacji.
- Brak współdzielenia zadań między użytkownikami — wyłącznie własność jednoosobowa.
- Brak kategorii/tagów/projektów grupujących zadania — poza zakresem MVP.
- Brak natywnej aplikacji mobilnej — wyłącznie responsywna aplikacja webowa.
- Brak integracji z kalendarzem zewnętrznym — terminy istnieją tylko wewnątrz aplikacji.
- Brak konfigurowalnego progu pilności — 48h jest wartością stałą w MVP, żeby uniknąć dodatkowego ekranu ustawień.

## Open Questions

1. **Czy zadanie z terminem w przeszłości (przeterminowane) powinno mieć inną etykietę niż "pilne" (np. "zaległe")?** — Owner: użytkownik. Domyślne założenie w MVP: traktowane tak samo jak pilne (termin ≤ teraz). Block: nie.
2. **Czy próg 48h jest odpowiedni dla tego typu zadań, czy powinien być inny?** — Owner: użytkownik. By: przed implementacją US-02. Block: nie, wartość domyślna 48h jest wystarczająca do startu.
