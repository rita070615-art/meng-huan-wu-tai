--
-- PostgreSQL database dump
--

\restrict 5UBN1Y37bCjFN4HO3weYggO6DNlcLOhJhj4x59cAfSjnsgcfFeB6uu9SGVbhc5p

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: bet_rounds; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.bet_rounds DISABLE TRIGGER ALL;

COPY public.bet_rounds (id, room_id, options, status, winner_option, created_at, closed_at) FROM stdin;
3301fdbe-9d56-4676-901f-a7cea3aa8cd0	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	[{"key": "A", "color": "#ef4444", "label": "力量"}, {"key": "B", "color": "#06b6d4", "label": "体力"}, {"key": "C", "color": "#a855f7", "label": "法力"}, {"key": "D", "color": "#3b82f6", "label": "耐力"}]	closed	B	2026-03-02 23:15:11.006521	2026-03-02 23:16:27.35
1425ed6a-3b5f-4aa9-99a8-340c73b83e3c	bf368b85-3433-494d-a828-00cc056e408e	[{"key": "A", "color": "#f97316", "label": "A"}, {"key": "B", "color": "#6366f1", "label": "B"}, {"key": "C", "color": "#10b981", "label": "C"}]	closed	A	2026-03-02 18:29:07.042785	2026-03-02 18:29:57.977
efe2b7c9-38d0-4675-9a22-17f287c1726d	bf368b85-3433-494d-a828-00cc056e408e	[{"key": "A", "color": "#f97316", "label": "骚鸡懒觉大"}, {"key": "B", "color": "#6366f1", "label": "阿东懒觉大"}, {"key": "C", "color": "#10b981", "label": "阿JUNE懒觉小"}]	closed	C	2026-03-02 18:30:34.281419	2026-03-02 18:31:18.771
f8547689-7611-43c4-9793-2250860c787b	bf368b85-3433-494d-a828-00cc056e408e	[{"key": "A", "color": "#f97316", "label": "骚鸡懒觉大"}, {"key": "B", "color": "#6366f1", "label": "阿东懒觉大"}, {"key": "C", "color": "#10b981", "label": "阿JUNE懒觉小"}]	closed	B	2026-03-02 18:31:48.448693	2026-03-02 18:46:43.222
9786251b-8ba9-4c79-8fa7-0cf2a81b55e0	55820045-c6fd-47ce-975b-aaa141ff2971	[{"key": "A", "color": "#f97316", "label": "A"}, {"key": "B", "color": "#6366f1", "label": "B"}, {"key": "C", "color": "#10b981", "label": "C"}]	closed	A	2026-03-02 20:44:32.285057	2026-03-02 20:45:29.784
8e0dd170-a399-4e8e-b483-5d7111e0af7d	55820045-c6fd-47ce-975b-aaa141ff2971	[{"key": "A", "color": "#f97316", "label": "A"}, {"key": "B", "color": "#6366f1", "label": "B"}, {"key": "C", "color": "#10b981", "label": "C"}]	closed	B	2026-03-02 20:47:25.938192	2026-03-02 21:15:36.304
6d7ec20d-fc1f-4330-b769-9fe5854f8cd4	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	[{"key": "A", "color": "#f97316", "label": "A"}, {"key": "B", "color": "#6366f1", "label": "B"}, {"key": "C", "color": "#10b981", "label": "C"}]	closed	A	2026-03-02 21:14:35.391213	2026-03-02 21:24:37.889
60b0d319-cdb2-4690-9453-2d5adfa16619	ba0aebef-2c75-44cf-95c0-121e3a09904d	[{"key": "A", "color": "#f97316", "label": "A"}, {"key": "B", "color": "#6366f1", "label": "B"}, {"key": "C", "color": "#10b981", "label": "C"}]	closed	A	2026-03-02 21:24:52.160939	2026-03-02 21:25:06.857
3796b49f-536a-424a-b6f9-3b90a657c9b7	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	[{"key": "A", "color": "#ef4444", "label": "力量"}, {"key": "B", "color": "#06b6d4", "label": "体力"}, {"key": "C", "color": "#a855f7", "label": "法力"}, {"key": "D", "color": "#3b82f6", "label": "耐力"}]	closed	B	2026-03-02 21:26:04.323208	2026-03-02 21:29:55.634
4a7cc2d5-99c0-4245-b0bd-ff110f5ef396	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	[{"key": "A", "color": "#ef4444", "label": "力量"}, {"key": "B", "color": "#06b6d4", "label": "体力"}, {"key": "C", "color": "#a855f7", "label": "法力"}, {"key": "D", "color": "#3b82f6", "label": "耐力"}]	closed	A	2026-03-02 21:30:10.100043	2026-03-02 21:36:32.126
86e36acf-c093-4d0e-950c-dd11cce1ef19	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	[{"key": "A", "color": "#ef4444", "label": "力量"}, {"key": "B", "color": "#06b6d4", "label": "体力"}, {"key": "C", "color": "#a855f7", "label": "法力"}, {"key": "D", "color": "#3b82f6", "label": "耐力"}]	closed	B	2026-03-02 21:37:57.23422	2026-03-02 23:15:06.713
a397353c-8b7d-41a4-8778-e7db29bc751d	afcf964c-b0f1-4aeb-a0fe-7acb1d2195b2	[{"key": "A", "color": "#ef4444", "label": "力量"}, {"key": "B", "color": "#06b6d4", "label": "体力"}, {"key": "C", "color": "#a855f7", "label": "法力"}, {"key": "D", "color": "#3b82f6", "label": "耐力"}]	closed	C	2026-03-02 23:21:08.664881	2026-03-02 23:22:15.714
\.


ALTER TABLE public.bet_rounds ENABLE TRIGGER ALL;

--
-- Data for Name: bets; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.bets DISABLE TRIGGER ALL;

COPY public.bets (id, round_id, room_id, user_id, username, option, amount, created_at, nickname) FROM stdin;
a583e888-452a-42dc-b5a7-4a4c4eb56bc2	1425ed6a-3b5f-4aa9-99a8-340c73b83e3c	bf368b85-3433-494d-a828-00cc056e408e	9ed0fd5f-4508-47e3-9b58-98a7bbef7c97	testuser_mbEhJD	C	265	2026-03-02 18:29:07.111758	\N
dd98583b-f82c-4c41-a30d-fef90375f8b4	1425ed6a-3b5f-4aa9-99a8-340c73b83e3c	bf368b85-3433-494d-a828-00cc056e408e	b3ed8fb0-3f88-4293-ad2f-03a4d0839961	admin	A	1000	2026-03-02 18:29:49.422066	\N
30ba54ff-c3c2-40b0-9a49-7e5d44b62b06	efe2b7c9-38d0-4675-9a22-17f287c1726d	bf368b85-3433-494d-a828-00cc056e408e	9ed0fd5f-4508-47e3-9b58-98a7bbef7c97	testuser_mbEhJD	A	288	2026-03-02 18:30:34.289086	\N
1826ed6a-c408-4efa-8c73-26a7292e219a	efe2b7c9-38d0-4675-9a22-17f287c1726d	bf368b85-3433-494d-a828-00cc056e408e	b3ed8fb0-3f88-4293-ad2f-03a4d0839961	admin	C	1000000	2026-03-02 18:30:59.095591	\N
1bf40d78-c951-4233-ae77-3413948a00a3	f8547689-7611-43c4-9793-2250860c787b	bf368b85-3433-494d-a828-00cc056e408e	9ed0fd5f-4508-47e3-9b58-98a7bbef7c97	testuser_mbEhJD	B	334	2026-03-02 18:31:48.455984	\N
e49d7de1-5d95-4ccf-8a40-e87e661952c6	f8547689-7611-43c4-9793-2250860c787b	bf368b85-3433-494d-a828-00cc056e408e	33f7c433-e6af-46d8-9639-d768c218b9fe	qwe	A	265	2026-03-02 18:46:17.110035	\N
1761574a-57bf-4970-9441-70110883008e	9786251b-8ba9-4c79-8fa7-0cf2a81b55e0	55820045-c6fd-47ce-975b-aaa141ff2971	9ed0fd5f-4508-47e3-9b58-98a7bbef7c97	QuirkyPrawn	C	299	2026-03-02 20:44:32.327182	\N
6897df3e-3d9c-4aa8-985e-d3cfd23b6903	9786251b-8ba9-4c79-8fa7-0cf2a81b55e0	55820045-c6fd-47ce-975b-aaa141ff2971	c31b447b-011c-4d0b-87e9-0c02941947bf	QuirkyFawn	A	386	2026-03-02 20:44:32.331721	\N
5b0ae8fd-2b29-4474-b6cd-94beb75c7a17	9786251b-8ba9-4c79-8fa7-0cf2a81b55e0	55820045-c6fd-47ce-975b-aaa141ff2971	e988ef68-7365-4ad3-a364-93e15e781c83	FlappyBird	B	237	2026-03-02 20:44:32.344701	\N
8132e945-f9cf-48ba-8bba-68f7b3cca82c	9786251b-8ba9-4c79-8fa7-0cf2a81b55e0	55820045-c6fd-47ce-975b-aaa141ff2971	02ab2ea3-9c63-48e6-b35e-de6914508eb9	HydroGarnet	A	358	2026-03-02 20:44:32.348236	\N
5eae756e-897f-4af3-b939-9a12fae3e663	8e0dd170-a399-4e8e-b483-5d7111e0af7d	55820045-c6fd-47ce-975b-aaa141ff2971	02ab2ea3-9c63-48e6-b35e-de6914508eb9	HydroGarnet	A	237	2026-03-02 20:47:25.990982	\N
e0e9e865-3f6b-4e97-9574-d3e8009ae526	8e0dd170-a399-4e8e-b483-5d7111e0af7d	55820045-c6fd-47ce-975b-aaa141ff2971	c31b447b-011c-4d0b-87e9-0c02941947bf	QuirkyFawn	C	256	2026-03-02 20:47:26.005861	\N
2d8fb09c-9cb5-4e5d-a52d-101815d178c0	8e0dd170-a399-4e8e-b483-5d7111e0af7d	55820045-c6fd-47ce-975b-aaa141ff2971	9ed0fd5f-4508-47e3-9b58-98a7bbef7c97	QuirkyPrawn	C	327	2026-03-02 20:47:26.009876	\N
8091fbc2-be5f-40cd-bda9-ad2c62c342bb	8e0dd170-a399-4e8e-b483-5d7111e0af7d	55820045-c6fd-47ce-975b-aaa141ff2971	e988ef68-7365-4ad3-a364-93e15e781c83	FlappyBird	C	131	2026-03-02 20:47:26.014757	\N
1136adec-0830-4f0f-839b-5860712993c0	8e0dd170-a399-4e8e-b483-5d7111e0af7d	55820045-c6fd-47ce-975b-aaa141ff2971	a597b4a0-8147-4517-84bd-ba1a43fd8ff1	player1	A	100	2026-03-02 21:03:42.084092	\N
da16f32b-6741-4438-9023-ad86dae818a5	8e0dd170-a399-4e8e-b483-5d7111e0af7d	55820045-c6fd-47ce-975b-aaa141ff2971	782153ca-fab1-4f24-8cdb-09d59fbdbf29	DONG798	A	1000	2026-03-02 21:12:21.238275	\N
36c7a3fe-67df-4af6-9f23-12dde229f73c	6d7ec20d-fc1f-4330-b769-9fe5854f8cd4	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	02ab2ea3-9c63-48e6-b35e-de6914508eb9	HydroGarnet	A	420	2026-03-02 21:14:35.410107	\N
bba82585-3f8c-4bfb-8c8f-90f4662cac97	6d7ec20d-fc1f-4330-b769-9fe5854f8cd4	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	c31b447b-011c-4d0b-87e9-0c02941947bf	QuirkyFawn	A	326	2026-03-02 21:14:35.413233	\N
9ffcd34a-87f3-4302-9f8a-848cbe58a041	6d7ec20d-fc1f-4330-b769-9fe5854f8cd4	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	9ed0fd5f-4508-47e3-9b58-98a7bbef7c97	QuirkyPrawn	B	190	2026-03-02 21:14:35.416492	\N
1289cfa9-8c7a-40c1-be4a-c81996fe95f8	6d7ec20d-fc1f-4330-b769-9fe5854f8cd4	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	e988ef68-7365-4ad3-a364-93e15e781c83	FlappyBird	C	358	2026-03-02 21:14:35.419494	\N
57de1be9-8ab1-4e76-9462-ff7c27d86755	6d7ec20d-fc1f-4330-b769-9fe5854f8cd4	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	b3ed8fb0-3f88-4293-ad2f-03a4d0839961	@DONG798	A	100	2026-03-02 21:22:42.333103	\N
27f3c3cf-6478-4a86-af2a-5f09c66912b2	60b0d319-cdb2-4690-9453-2d5adfa16619	ba0aebef-2c75-44cf-95c0-121e3a09904d	c31b447b-011c-4d0b-87e9-0c02941947bf	QuirkyFawn	B	355	2026-03-02 21:24:52.168561	\N
181c6e8d-62cf-4a19-b10e-6c1adc5ea7b7	60b0d319-cdb2-4690-9453-2d5adfa16619	ba0aebef-2c75-44cf-95c0-121e3a09904d	02ab2ea3-9c63-48e6-b35e-de6914508eb9	HydroGarnet	A	125	2026-03-02 21:24:52.171227	\N
40afc667-df47-4199-90f9-bf84ef2ce97c	60b0d319-cdb2-4690-9453-2d5adfa16619	ba0aebef-2c75-44cf-95c0-121e3a09904d	9ed0fd5f-4508-47e3-9b58-98a7bbef7c97	QuirkyPrawn	A	340	2026-03-02 21:24:52.174163	\N
7c80ba1d-d043-4f4c-b923-2e4f9bd875dd	60b0d319-cdb2-4690-9453-2d5adfa16619	ba0aebef-2c75-44cf-95c0-121e3a09904d	e988ef68-7365-4ad3-a364-93e15e781c83	FlappyBird	B	233	2026-03-02 21:24:52.177124	\N
99204d26-3230-4790-894e-ac49d373216b	3796b49f-536a-424a-b6f9-3b90a657c9b7	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	e988ef68-7365-4ad3-a364-93e15e781c83	FlappyBird	C	198	2026-03-02 21:26:29.974242	\N
e5ec19eb-982b-4412-b770-ccb7b4095f36	3796b49f-536a-424a-b6f9-3b90a657c9b7	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	02ab2ea3-9c63-48e6-b35e-de6914508eb9	HydroGarnet	A	312	2026-03-02 21:26:40.897381	\N
6f61853c-6574-46be-a0a1-7f9969f52e05	3796b49f-536a-424a-b6f9-3b90a657c9b7	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	c31b447b-011c-4d0b-87e9-0c02941947bf	QuirkyFawn	C	162	2026-03-02 21:27:23.431368	\N
a097fa63-6c1a-49cf-8e61-435f1bddc244	3796b49f-536a-424a-b6f9-3b90a657c9b7	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	9ed0fd5f-4508-47e3-9b58-98a7bbef7c97	QuirkyPrawn	B	482	2026-03-02 21:27:32.260807	\N
6e2ced67-1683-4ee7-8da9-8e09aac3dcae	3796b49f-536a-424a-b6f9-3b90a657c9b7	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	b3ed8fb0-3f88-4293-ad2f-03a4d0839961	@DONG798	B	100	2026-03-02 21:29:50.032588	\N
f1a92cdb-493e-4610-8fb4-bcd06659b9b5	4a7cc2d5-99c0-4245-b0bd-ff110f5ef396	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	02ab2ea3-9c63-48e6-b35e-de6914508eb9	HydroGarnet	B	312	2026-03-02 21:30:25.229876	\N
ba967104-3c45-45e7-8c21-bd66c2084e08	4a7cc2d5-99c0-4245-b0bd-ff110f5ef396	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	b3ed8fb0-3f88-4293-ad2f-03a4d0839961	@DONG798	B	100	2026-03-02 21:30:31.793031	\N
791f0a7b-9c6d-4efe-9520-513c4edd350b	4a7cc2d5-99c0-4245-b0bd-ff110f5ef396	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	c31b447b-011c-4d0b-87e9-0c02941947bf	QuirkyFawn	C	111	2026-03-02 21:30:35.929561	\N
d8c75292-5fcb-46e9-b3ca-85e0a3064bc7	4a7cc2d5-99c0-4245-b0bd-ff110f5ef396	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	9ed0fd5f-4508-47e3-9b58-98a7bbef7c97	QuirkyPrawn	D	346	2026-03-02 21:30:59.60952	\N
2978b3b3-e694-4f95-bea6-f0be17ff4dd6	4a7cc2d5-99c0-4245-b0bd-ff110f5ef396	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	e988ef68-7365-4ad3-a364-93e15e781c83	FlappyBird	D	454	2026-03-02 21:31:32.18301	\N
023839f6-efd3-40f0-bb50-6ca73fbe4e61	86e36acf-c093-4d0e-950c-dd11cce1ef19	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	c31b447b-011c-4d0b-87e9-0c02941947bf	QuirkyFawn	C	189	2026-03-02 21:38:08.569154	\N
dc9935dd-6299-4235-a4b1-31ff01f4cdfd	86e36acf-c093-4d0e-950c-dd11cce1ef19	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	9ed0fd5f-4508-47e3-9b58-98a7bbef7c97	QuirkyPrawn	C	453	2026-03-02 21:38:37.556953	\N
42d2eebc-af5d-4667-a9f5-fb316ea14fc7	86e36acf-c093-4d0e-950c-dd11cce1ef19	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	a597b4a0-8147-4517-84bd-ba1a43fd8ff1	Pounce#9	B	235	2026-03-02 21:38:46.748181	\N
45c3d703-17bd-42a2-ab36-f460c4552f00	86e36acf-c093-4d0e-950c-dd11cce1ef19	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	a3210b6e-6c62-4118-b0e6-f57f7ff659f0	Claw$Hawk	D	406	2026-03-02 21:38:49.893767	\N
b2f339e7-2d77-47ed-a36c-2a9edbfe9953	86e36acf-c093-4d0e-950c-dd11cce1ef19	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	e988ef68-7365-4ad3-a364-93e15e781c83	FlappyBird	A	158	2026-03-02 21:39:00.75852	\N
ec6e5635-328e-4ecd-857a-ca850da02b1e	86e36acf-c093-4d0e-950c-dd11cce1ef19	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	02ab2ea3-9c63-48e6-b35e-de6914508eb9	HydroGarnet	A	337	2026-03-02 21:39:24.66853	\N
6a6bee19-70ad-493a-b1f9-de4a3f67b706	86e36acf-c093-4d0e-950c-dd11cce1ef19	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	782153ca-fab1-4f24-8cdb-09d59fbdbf29	DONG798	B	100	2026-03-02 23:03:39.366969	小东
c37ebfaa-7f34-4744-93e0-220b3325f828	3301fdbe-9d56-4676-901f-a7cea3aa8cd0	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	782153ca-fab1-4f24-8cdb-09d59fbdbf29	DONG798	B	100	2026-03-02 23:15:17.034572	小东
b02fc4dd-dcc2-4044-af0c-7a20ce953fd3	3301fdbe-9d56-4676-901f-a7cea3aa8cd0	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	9ed0fd5f-4508-47e3-9b58-98a7bbef7c97	QuirkyPrawn	C	178	2026-03-02 23:15:18.429064	酒初南
90000ab1-733b-4ef8-b25a-e01abb957fb0	3301fdbe-9d56-4676-901f-a7cea3aa8cd0	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	a3210b6e-6c62-4118-b0e6-f57f7ff659f0	Claw$Hawk	A	431	2026-03-02 23:15:23.262282	月亮
fa1faad6-c32c-451c-b1d8-d0113c1f9c1c	3301fdbe-9d56-4676-901f-a7cea3aa8cd0	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	c31b447b-011c-4d0b-87e9-0c02941947bf	QuirkyFawn	D	119	2026-03-02 23:15:30.98018	战囡
01a4d6b5-1c8c-443f-8c3f-0f6383f02bcb	3301fdbe-9d56-4676-901f-a7cea3aa8cd0	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	a597b4a0-8147-4517-84bd-ba1a43fd8ff1	Pounce#9	A	150	2026-03-02 23:15:50.942002	星星
18be061c-5638-4dde-90cd-b966a17c49ea	3301fdbe-9d56-4676-901f-a7cea3aa8cd0	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	e988ef68-7365-4ad3-a364-93e15e781c83	FlappyBird	B	113	2026-03-02 23:16:09.926219	蓝思嫒
38e06b98-6180-48b6-8277-061616a3e97a	3301fdbe-9d56-4676-901f-a7cea3aa8cd0	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	02ab2ea3-9c63-48e6-b35e-de6914508eb9	HydroGarnet	B	406	2026-03-02 23:16:13.433171	零如冬
3f0432e3-11dc-4542-b213-404edbbab995	a397353c-8b7d-41a4-8778-e7db29bc751d	afcf964c-b0f1-4aeb-a0fe-7acb1d2195b2	9ed0fd5f-4508-47e3-9b58-98a7bbef7c97	QuirkyPrawn	D	406	2026-03-02 23:21:17.919729	酒初南
70d80b41-b660-4d10-8391-995c61d09098	a397353c-8b7d-41a4-8778-e7db29bc751d	afcf964c-b0f1-4aeb-a0fe-7acb1d2195b2	a597b4a0-8147-4517-84bd-ba1a43fd8ff1	Pounce#9	C	345	2026-03-02 23:21:21.19398	星星
4dd1b324-81c7-489c-ad2f-6f37a23966cb	a397353c-8b7d-41a4-8778-e7db29bc751d	afcf964c-b0f1-4aeb-a0fe-7acb1d2195b2	e988ef68-7365-4ad3-a364-93e15e781c83	FlappyBird	D	113	2026-03-02 23:21:35.421597	蓝思嫒
3778a79b-d0b3-4c2d-a595-7345d6ea7a34	a397353c-8b7d-41a4-8778-e7db29bc751d	afcf964c-b0f1-4aeb-a0fe-7acb1d2195b2	c31b447b-011c-4d0b-87e9-0c02941947bf	QuirkyFawn	D	263	2026-03-02 23:21:55.131147	战囡
2326c8a4-60f0-45b9-ad1d-fbb39ac0b6ef	a397353c-8b7d-41a4-8778-e7db29bc751d	afcf964c-b0f1-4aeb-a0fe-7acb1d2195b2	782153ca-fab1-4f24-8cdb-09d59fbdbf29	DONG798	C	1000	2026-03-02 23:22:00.962651	小东
\.


ALTER TABLE public.bets ENABLE TRIGGER ALL;

--
-- Data for Name: bot_settings; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.bot_settings DISABLE TRIGGER ALL;

COPY public.bot_settings (id, enabled, min_amount, max_amount, updated_at) FROM stdin;
default	t	100	500	2026-03-02 18:27:04.277
\.


ALTER TABLE public.bot_settings ENABLE TRIGGER ALL;

--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.messages DISABLE TRIGGER ALL;

COPY public.messages (id, room_id, user_id, username, content, type, created_at) FROM stdin;
3b840361-0193-4ea4-8fed-569633bffa07	55820045-c6fd-47ce-975b-aaa141ff2971	\N	\N	点餐已开始！请选择您的选项。	system	2026-03-02 20:44:32.320331
a2e8c450-1fbb-4d23-85c2-a64a6a8a386a	55820045-c6fd-47ce-975b-aaa141ff2971	\N	\N	点餐已结束！获胜选项：A。奖池共 1280 金币，已分配给胜者。	system	2026-03-02 20:45:29.801777
8641010e-4638-4712-a424-709b15337a4a	55820045-c6fd-47ce-975b-aaa141ff2971	\N	\N	点餐已开始！请选择您的选项。	system	2026-03-02 20:47:25.984112
2409429c-0b0f-4e3c-ba66-29e64d78b66a	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	\N	\N	点餐已开始！请选择您的选项。	system	2026-03-02 21:14:35.39439
535772c6-edfe-4b4f-869e-874949064e85	55820045-c6fd-47ce-975b-aaa141ff2971	\N	\N	点餐已结束！获胜选项：B。奖池共 2051 金币，已分配给胜者。	system	2026-03-02 21:15:36.309244
b630c976-9e72-445e-9ed6-0c78cbd1cad6	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	\N	\N	点餐已结束！获胜选项：A。奖池共 1394 金币，已分配给胜者。	system	2026-03-02 21:24:37.951871
5c9d6361-04c4-48e7-b743-cf3746f6259a	91dbeb6f-4c27-4623-9ce7-ee3873d0fd08	\N	\N	欢迎来到百家乐大厅！	system	2026-03-02 20:01:35.782144
90443d2e-356f-41fb-a504-cdfea240b8fd	91dbeb6f-4c27-4623-9ce7-ee3873d0fd08	\N	\N	请理性点餐，享受用餐乐趣。	system	2026-03-02 20:01:35.785273
7abe3809-aa8d-4d12-8e4b-1b8586119aa9	fcd788f2-7fe1-47d0-97ff-81719d6571cb	\N	\N	欢迎来到竞技预测厅！	system	2026-03-02 20:01:35.788145
52426ed2-f687-430c-af71-e538fd3a2d36	8e7344dd-e2f0-4ec1-8800-9ac244860425	\N	\N	欢迎来到幸运色子间！	system	2026-03-02 20:01:35.790788
303e0a17-481c-43e9-a035-4cb55592e8f2	ab785c6d-a571-4a55-b2b8-51bc558bba6c	\N	\N	欢迎来到百家乐大厅！	system	2026-03-02 20:40:26.046357
26e1d61b-27b0-4837-baec-68ee9937a9b2	ab785c6d-a571-4a55-b2b8-51bc558bba6c	\N	\N	请理性点餐，享受用餐乐趣。	system	2026-03-02 20:40:26.049424
954b8130-c20a-4b80-b6ed-064b94693e96	529feb34-4532-41c4-90c9-71a03a7a4f7d	\N	\N	欢迎来到竞技预测厅！	system	2026-03-02 20:40:26.053094
10db90b7-2465-4abd-971a-a6f198332223	55820045-c6fd-47ce-975b-aaa141ff2971	\N	\N	欢迎来到幸运色子间！	system	2026-03-02 20:40:26.056421
d531ef29-f6df-4982-b544-82825621a704	ba0aebef-2c75-44cf-95c0-121e3a09904d	\N	\N	点餐已开始！请选择您的选项。	system	2026-03-02 21:24:52.164355
70cebdd4-5b55-4fe0-9aca-785e6d8176a4	ba0aebef-2c75-44cf-95c0-121e3a09904d	\N	\N	点餐已结束！获胜选项：A。奖池共 1053 金币，已分配给胜者。	system	2026-03-02 21:25:06.869156
655866ba-3601-4e75-aa50-032ec6f833ac	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	\N	\N	今日菜单已开放，请选择您的口味。	system	2026-03-02 21:26:04.362755
38b05733-b501-4f5b-ab04-ed06faa1bf6b	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	\N	\N	本轮厨房已完成出餐。\n今日人气口味：体力\n感谢参与点餐体验。	system	2026-03-02 21:29:55.64828
dc529c4e-f41e-45a1-8e81-64336a6b76d6	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	\N	\N	今日菜单已开放，请选择您的口味。	system	2026-03-02 21:30:10.103269
a44468bd-ba41-440b-9f45-644ed803545c	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	\N	\N	本轮厨房已完成出餐。\n今日人气口味：力量\n感谢参与点餐体验。	system	2026-03-02 21:36:32.143197
b64fec08-1caa-483b-9b54-f92285f5eb68	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	\N	\N	今日菜单已开放，请选择您的口味。	system	2026-03-02 21:37:57.268184
0ea803e4-4c29-4514-923a-e1a8b685e739	6960e529-50bc-41a0-b95f-72b5757cfa4a	\N	\N	欢迎来到百家乐大厅！	system	2026-03-02 22:07:28.000686
df93443b-86d3-4916-ade2-914504414a21	6960e529-50bc-41a0-b95f-72b5757cfa4a	\N	\N	请理性点餐，享受用餐乐趣。	system	2026-03-02 22:07:28.004223
18f81f2d-ea6f-4e84-aaff-3e2fea096b8f	7157e074-a28b-4b79-9913-feb0431ae51a	\N	\N	欢迎来到竞技预测厅！	system	2026-03-02 22:07:28.007687
52243d56-1a3a-4d30-9f2f-e8e0c13962cb	3d4cd7d4-867e-47b3-a745-f7c535bcc77e	\N	\N	欢迎来到幸运色子间！	system	2026-03-02 22:07:28.011727
20b91f7b-488c-4bb4-9661-3fdbecf3a521	839c108d-1db7-4335-bd66-c38420b06142	\N	\N	欢迎来到百家乐大厅！	system	2026-03-02 23:10:30.988402
a5c1e5a9-0850-45d5-83d5-5c0fe0a42ade	839c108d-1db7-4335-bd66-c38420b06142	\N	\N	请理性点餐，享受用餐乐趣。	system	2026-03-02 23:10:30.991538
c9486a3d-3c14-4a32-a38e-8149e7e88009	d4386a40-3ff7-4df6-8500-655edcb540ef	\N	\N	欢迎来到竞技预测厅！	system	2026-03-02 23:10:30.994663
c62657a8-2d8b-49d6-9a4f-96a7167039c7	092767bc-12e0-4860-8992-b01bda31b6ce	\N	\N	欢迎来到幸运色子间！	system	2026-03-02 23:10:30.998069
747d67ae-d858-4eb5-9967-2eed1a39b474	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	\N	\N	本轮厨房已完成出餐。\n今日人气口味：体力\n感谢参与点餐体验。	system	2026-03-02 23:15:06.726007
027626b2-589d-400d-bcb3-232b190057b4	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	\N	\N	今日菜单已开放，请选择您的口味。	system	2026-03-02 23:15:11.009023
3151cae0-e059-44b4-aca3-5944bc61b21a	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	b3ed8fb0-3f88-4293-ad2f-03a4d0839961	阿东（管理）	Hhh	user	2026-03-02 23:15:58.276226
1a174c92-d179-4984-919f-2d8995e1ecec	c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	\N	\N	本轮厨房已完成出餐。\n今日人气口味：体力\n感谢参与点餐体验。	system	2026-03-02 23:16:27.438671
371c3e04-c21c-413a-a210-e9f639010514	afcf964c-b0f1-4aeb-a0fe-7acb1d2195b2	\N	\N	今日菜单已开放，请选择您的口味。	system	2026-03-02 23:21:08.825651
11fd196a-fa7a-4bd8-b5b0-0ff86251804d	afcf964c-b0f1-4aeb-a0fe-7acb1d2195b2	\N	\N	本轮厨房已完成出餐。\n今日人气口味：法力\n感谢参与点餐体验。	system	2026-03-02 23:22:15.767209
3a7a5eb7-1200-4b54-bb9b-8c56d069f985	9a3432fd-0192-42b5-b145-2a7ce68b2993	\N	\N	欢迎来到百家乐大厅！	system	2026-03-02 23:22:59.499485
fec48a30-901d-45bd-bbde-1a3a621a72c9	9a3432fd-0192-42b5-b145-2a7ce68b2993	\N	\N	请理性点餐，享受用餐乐趣。	system	2026-03-02 23:22:59.503171
4d47c4ea-59b1-4f46-b46a-10aae2684a9f	a5fc97a2-b2af-40b3-848c-3084f6b47917	\N	\N	欢迎来到竞技预测厅！	system	2026-03-02 23:22:59.506631
bcd1b64d-06a9-4a68-89de-c539c0d15f86	760fa2ee-fddb-4968-82f8-196eeeec2f9f	\N	\N	欢迎来到幸运色子间！	system	2026-03-02 23:22:59.51035
\.


ALTER TABLE public.messages ENABLE TRIGGER ALL;

--
-- Data for Name: private_messages; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.private_messages DISABLE TRIGGER ALL;

COPY public.private_messages (id, user_id, user_username, user_nickname, admin_id, admin_username, content, is_from_admin, read_by_admin, read_by_user, created_at) FROM stdin;
8eef2b6a-904e-478e-86ca-ebb525805a62	00000000-0000-0000-0000-000000000000	访客	访客1	\N	\N	1	f	t	f	2026-03-02 21:50:36.072662
\.


ALTER TABLE public.private_messages ENABLE TRIGGER ALL;

--
-- Data for Name: rooms; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.rooms DISABLE TRIGGER ALL;

COPY public.rooms (id, name, description, created_by, is_active, created_at, game_url, password, chat_muted) FROM stdin;
ba0aebef-2c75-44cf-95c0-121e3a09904d	初梦	刚刚踏入梦幻世界，带着一点点光与想象。	b3ed8fb0-3f88-4293-ad2f-03a4d0839961	t	2026-03-02 18:42:15.128034			f
e110f158-d093-4d80-a24e-bd8691d6b191	璀璨	光芒明显增强，华丽感与视觉冲击力提升。	b3ed8fb0-3f88-4293-ad2f-03a4d0839961	t	2026-03-02 18:48:32.528245			f
afcf964c-b0f1-4aeb-a0fe-7acb1d2195b2	辉煌	气势宏大，舞台效果震撼，达到高级水准。	b3ed8fb0-3f88-4293-ad2f-03a4d0839961	t	2026-03-02 18:48:39.864804			f
93a9721e-ef5e-4afc-bdcb-3d42ed815047	星耀	如繁星闪耀，具有吸引目光的亮点与表现力。	b3ed8fb0-3f88-4293-ad2f-03a4d0839961	t	2026-03-02 18:48:21.833709			f
924f3fd4-fbc9-479b-87eb-0303ee053242	梦境	极致梦幻，宛如神级舞台，震撼全场的最高等级。	b3ed8fb0-3f88-4293-ad2f-03a4d0839961	t	2026-03-02 18:48:49.181175			f
c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f	幻彩	开始绽放色彩，舞台光效初现，氛围感增强。	b3ed8fb0-3f88-4293-ad2f-03a4d0839961	t	2026-03-02 18:48:12.581803			f
\.


ALTER TABLE public.rooms ENABLE TRIGGER ALL;

--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.users DISABLE TRIGGER ALL;

COPY public.users (id, username, password, balance, role, created_at, notes, banned, registration_ip, is_shill, nickname, totp_secret, totp_enabled, muted) FROM stdin;
b3ed8fb0-3f88-4293-ad2f-03a4d0839961	@DONG798	Thongsheng@02	9900437	admin	2026-03-02 17:36:26.80687	管理员\n	f		f	阿东（管理）	\N	f	f
a3210b6e-6c62-4118-b0e6-f57f7ff659f0	Claw$Hawk	el-G4V17'_#c	15000	user	2026-03-02 20:40:26.031487	托	f		t	月亮	\N	f	f
8ffe147b-8700-4d1d-b327-f5fe8b9f3cca	Angrybird	el-G4V17'_#c	1500	user	2026-03-02 22:07:27.976226		f		f	太阳	\N	f	f
bb62b18f-8abc-47d0-98b8-c5c738d38d01	Hitatami	el-G4V17'_#c	2000	user	2026-03-02 22:07:27.971925		f		f	地球	\N	f	f
02ab2ea3-9c63-48e6-b35e-de6914508eb9	HydroGarnet	MRV>4Ilu2&8n	12313	user	2026-03-02 18:44:21.359458		f	34.67.233.138	t	零如冬	\N	f	f
e988ef68-7365-4ad3-a364-93e15e781c83	FlappyBird	@NU-7L5n5t65	10245	user	2026-03-02 17:36:26.811121	托	f		t	蓝思嫒	\N	f	f
782153ca-fab1-4f24-8cdb-09d59fbdbf29	DONG798	Aaaa1111	9944	user	2026-03-02 18:43:34.634933		f	60.54.15.13	f	小东	O5VXITD5JZQX2ZTUO5JSCVKWH5XXI3SE	t	f
a597b4a0-8147-4517-84bd-ba1a43fd8ff1	Pounce#9	el-G4V17'_#c	20676	user	2026-03-02 20:40:26.027012	托	f		t	星星	KFNVEOLRI5OTKYKAIRWWI533IVBGCQSL	t	f
f9325bf2-4ed3-4a9d-9165-aa798c0731bd	@aoe166	aoe16666	9999999	admin	2026-03-02 18:55:50.516149	老总	f		f	66总	\N	f	f
33f7c433-e6af-46d8-9639-d768c218b9fe	qwe	123123	999734	user	2026-03-02 18:04:11.037404		f		f	骚鸡	\N	f	f
c31b447b-011c-4d0b-87e9-0c02941947bf	QuirkyFawn	el-G4V17'_#c	11080	user	2026-03-02 17:36:26.814028	托	f		t	战囡	\N	f	f
9ed0fd5f-4508-47e3-9b58-98a7bbef7c97	QuirkyPrawn	i1u[K14'K[Jx	12165	user	2026-03-02 17:39:46.842436	托	f		t	酒初南	\N	f	f
\.


ALTER TABLE public.users ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict 5UBN1Y37bCjFN4HO3weYggO6DNlcLOhJhj4x59cAfSjnsgcfFeB6uu9SGVbhc5p

