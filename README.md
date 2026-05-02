# Scenely

Scenely is a campus live-map social app built for college students to see what is happening around them in real time.

Instead of scrolling through disconnected posts, students can explore a map of their campus and discover nearby events, moments, crowds, and social activity based on location. The goal is to make campus feel more alive, connected, and immediate.

> Built with React Native, Expo, Supabase, PostgreSQL, and Mapbox.

---

## Screenshots

> Replace these with your actual screenshot paths after uploading them to the repo.

<p align="center">
  <img src="./assets/screenshots/home-map.png" width="250" alt="Scenely Map Screen" />
  <img src="./assets/screenshots/post-view.png" width="250" alt="Scenely Post Screen" />
  <img src="./assets/screenshots/create-post.png" width="250" alt="Scenely Create Post Screen" />
</p>

---

## Overview

Scenely is designed around a simple idea: campus activity should be visible where it is happening.

Students can open the app, view a live map of nearby posts, and instantly understand what is going on around campus. Whether it is a popular spot, a funny moment, a study area, a party, or a student event, Scenely brings location-based social discovery into one shared campus experience.

The app was built from the ground up as a mobile-first platform with real-time geospatial functionality, authentication, database-backed posts, and interactive map features.

---

## Features

- Live campus map with location-based posts
- Interactive map pins for nearby activity
- User authentication
- Create and view posts tied to specific locations
- Real-time backend powered by Supabase
- Geospatial data storage using PostgreSQL
- Mobile-first interface built with React Native
- Map rendering and location features using Mapbox
- Designed for college campus communities
- Scalable structure for future moderation, events, profiles, and social features

---

## Tech Stack

### Frontend

- React Native
- Expo
- TypeScript / JavaScript
- Mapbox Maps SDK
- React Navigation

### Backend

- Supabase
- PostgreSQL
- Supabase Auth
- Row Level Security
- Geospatial data modeling

### Tools

- Git / GitHub
- EAS Build
- iOS Simulator
- Environment-based configuration
- Mobile debugging and testing tools

---

## Architecture

Scenely uses a mobile client connected to a Supabase backend.

The React Native frontend handles the user interface, map rendering, location-based interactions, and post creation flow. Supabase manages authentication, database storage, and backend access control. PostgreSQL stores structured app data, including posts, users, timestamps, and location coordinates.

```txt
React Native App
      |
      |-- User Authentication
      |-- Map UI / Location Features
      |-- Post Creation / Viewing
      |
Supabase Backend
      |
      |-- PostgreSQL Database
      |-- Auth
      |-- Row Level Security
      |-- Geospatial Data
      |
Mapbox
      |
      |-- Interactive Campus Map
      |-- Map Pins
      |-- Location Rendering