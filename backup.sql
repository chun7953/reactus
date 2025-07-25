--
-- PostgreSQL database dump
--

-- Dumped from database version 16.8 (Debian 16.8-1.pgdg120+1)
-- Dumped by pg_dump version 16.9 (Debian 16.9-1.pgdg120+1)

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcements (
    guild_id text NOT NULL,
    channel_id text NOT NULL,
    message text NOT NULL
);


ALTER TABLE public.announcements OWNER TO postgres;

--
-- Name: calendar_monitors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.calendar_monitors (
    id integer NOT NULL,
    guild_id text NOT NULL,
    channel_id text NOT NULL,
    calendar_id text NOT NULL,
    trigger_keyword text NOT NULL,
    mention_role text
);


ALTER TABLE public.calendar_monitors OWNER TO postgres;

--
-- Name: calendar_monitors_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.calendar_monitors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.calendar_monitors_id_seq OWNER TO postgres;

--
-- Name: calendar_monitors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.calendar_monitors_id_seq OWNED BY public.calendar_monitors.id;


--
-- Name: giveaways; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.giveaways (
    message_id text NOT NULL,
    guild_id text NOT NULL,
    channel_id text NOT NULL,
    prize text NOT NULL,
    winner_count integer DEFAULT 1 NOT NULL,
    end_time timestamp with time zone NOT NULL,
    status text DEFAULT 'RUNNING'::text NOT NULL,
    winners text[],
    participants text[] DEFAULT '{}'::text[],
    validation_fails integer DEFAULT 0
);


ALTER TABLE public.giveaways OWNER TO postgres;

--
-- Name: guild_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guild_configs (
    guild_id text NOT NULL,
    main_calendar_id text,
    giveaway_manager_roles text[]
);


ALTER TABLE public.guild_configs OWNER TO postgres;

--
-- Name: notified_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notified_events (
    event_id text NOT NULL,
    notified_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.notified_events OWNER TO postgres;

--
-- Name: reactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reactions (
    guild_id text NOT NULL,
    channel_id text NOT NULL,
    emojis text NOT NULL,
    trigger text NOT NULL
);


ALTER TABLE public.reactions OWNER TO postgres;

--
-- Name: scheduled_giveaways; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scheduled_giveaways (
    id integer NOT NULL,
    guild_id text NOT NULL,
    prize text NOT NULL,
    winner_count integer DEFAULT 1 NOT NULL,
    giveaway_channel_id text NOT NULL,
    start_time timestamp with time zone,
    duration_hours numeric,
    end_time timestamp with time zone,
    schedule_cron text,
    confirmation_channel_id text,
    confirmation_role_id text
);


ALTER TABLE public.scheduled_giveaways OWNER TO postgres;

--
-- Name: scheduled_giveaways_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.scheduled_giveaways_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.scheduled_giveaways_id_seq OWNER TO postgres;

--
-- Name: scheduled_giveaways_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.scheduled_giveaways_id_seq OWNED BY public.scheduled_giveaways.id;


--
-- Name: calendar_monitors id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_monitors ALTER COLUMN id SET DEFAULT nextval('public.calendar_monitors_id_seq'::regclass);


--
-- Name: scheduled_giveaways id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scheduled_giveaways ALTER COLUMN id SET DEFAULT nextval('public.scheduled_giveaways_id_seq'::regclass);


--
-- Data for Name: announcements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.announcements (guild_id, channel_id, message) FROM stdin;
947086484098412564	959744237065338900	ダム別情報はこちら https://discord.com/channels/947086484098412564/1381093047311532063 https://discord.com/channels/947086484098412564/1381093314761195560 https://discord.com/channels/947086484098412564/1381093422743687298 https://discord.com/channels/947086484098412564/1381093499113570495 https://discord.com/channels/947086484098412564/1381093582072578078
947086484098412564	1283019475754418267	攻略情報→ https://discord.com/channels/947086484098412564/1393773349380816946
947086484098412564	1064030457576030320	スキルレベル登録 https://bit.ly/calmarskill\nかかし測定 https://docs.google.com/forms/d/e/1FAIpQLScmupQ2EbZQCR6BkCfNX1ClxTIPQX5sypcXLX-SbkCXaAjMjg/viewform?usp=header
\.


--
-- Data for Name: calendar_monitors; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.calendar_monitors (id, guild_id, channel_id, calendar_id, trigger_keyword, mention_role) FROM stdin;
5	1238401565149364225	1285084876965675058	panya.sub2021@gmail.com	ラキショ	\N
10	947086484098412564	1203247389247541278	carumaru610@gmail.com	レイド部	\N
11	947086484098412564	947086484098412567	carumaru610@gmail.com	ご連絡	\N
12	947086484098412564	959736404139716668	carumaru610@gmail.com	GvGアンケ	\N
13	947086484098412564	1081215611281096816	carumaru610@gmail.com	レイドアンケ	\N
14	947086484098412564	1132657645854146570	carumaru610@gmail.com	ラキショ	\N
\.


--
-- Data for Name: giveaways; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.giveaways (message_id, guild_id, channel_id, prize, winner_count, end_time, status, winners, participants, validation_fails) FROM stdin;
1397120988784623719	947086484098412564	1203247389247541278	テストA	5	2025-07-23 08:30:00+00	ERRORED	\N	{889160472157360160}	0
1397053607836385390	1238401565149364225	1285084876965675058	test	3	2025-07-22 03:20:00+00	CANCELLED	\N	{392980108375490580}	0
1397007170343538800	1238401565149364225	1285084876965675058	test	3	2025-07-22 00:08:40.665+00	ENDED	{392980108375490580}	{392980108375490580}	0
1397012780841832461	1238401565149364225	1285084876965675058	test1	2	2025-07-22 00:31:02.061+00	ENDED	{392980108375490580}	{392980108375490580}	0
1397120992559497248	947086484098412564	1203247389247541278	テストB	2	2025-07-23 08:30:00+00	ERRORED	\N	{889160472157360160}	0
1397034261219119200	1238401565149364225	1285084876965675058	test	1	2025-07-22 02:00:19.571+00	CANCELLED	\N	{392980108375490580}	0
1397053715877466274	1238401565149364225	1285084876965675058	2	3	2025-07-22 03:20:00+00	ENDED	{392980108375490580}	{392980108375490580}	0
1397036259796455578	1238401565149364225	1285084876965675058	3	1	2025-07-22 02:08:15.103+00	CANCELLED	\N	{392980108375490580}	0
1397038022649843936	1238401565149364225	1285084876965675058	ah	3	2025-07-22 02:15:15.705+00	CANCELLED	\N	{392980108375490580}	0
1397038113695469598	1238401565149364225	1285084876965675058	ah	3	2025-07-22 02:15:15.705+00	ENDED	{392980108375490580}	{392980108375490580}	0
1397063044990894222	1238401565149364225	1285084876965675058	teat	3	2025-07-22 04:00:00+00	CANCELLED	\N	{392980108375490580}	0
1397042861241008180	1238401565149364225	1285084876965675058	ss	3	2025-07-22 02:34:29.3+00	CANCELLED	\N	{392980108375490580}	0
1397201522147721259	947086484098412564	1132657645854146570	テストA	5	2025-07-23 13:00:00+00	ERRORED	\N	{}	0
1397064738046738602	1238401565149364225	1285084876965675058	test2	2	2025-07-22 04:00:00+00	CANCELLED	\N	{392980108375490580}	0
1397042964848578643	1238401565149364225	1285084876965675058	ss	3	2025-07-22 02:34:29.3+00	ENDED	{}	{}	0
1397047451847753728	1238401565149364225	1285084876965675058	test	3	2025-07-22 02:50:43.22+00	CANCELLED	\N	{392980108375490580}	0
1397047563919818774	1238401565149364225	1285084876965675058	test	3	2025-07-22 02:50:00+00	ENDED	{}	{}	0
1397201527218638862	947086484098412564	1132657645854146570	テストB	2	2025-07-23 13:00:00+00	ERRORED	\N	{}	0
1397049972398227547	1238401565149364225	1285084876965675058	test	2	2025-07-22 03:00:45.179+00	CANCELLED	\N	{392980108375490580}	0
1397050043898531932	1238401565149364225	1285084876965675058	test	2	2025-07-22 03:00:00+00	ENDED	{}	{}	0
1397051759041450066	1238401565149364225	1285084876965675058	stest	3	2025-07-22 03:07:51.361+00	CANCELLED	\N	{392980108375490580}	0
1397064807613599838	1238401565149364225	1285084876965675058	test2	2	2025-07-22 04:00:00+00	CANCELLED	\N	{392980108375490580}	0
1397051859306549288	1238401565149364225	1285084876965675058	stest	3	2025-07-22 03:10:00+00	ENDED	{}	{}	0
1397063111651102821	1238401565149364225	1285084876965675058	teat	3	2025-07-22 04:00:00+00	ENDED	{}	{}	0
1397065526773158029	1238401565149364225	1285084876965675058	test2	2	2025-07-22 04:00:00+00	ENDED	{392980108375490580}	{392980108375490580}	0
1397103380836388945	1238401565149364225	1285084876965675058	テスト１	2	2025-07-22 13:00:00+00	ENDED	\N	{}	0
1397108407001153677	947086484098412564	1203247389247541278	テストA	5	2025-07-23 13:00:00+00	ERRORED	\N	{896758144284360714,1077050354501419049,889160472157360160}	0
1397196504648646787	947086484098412564	1132657645854146570	テスト２	2	2025-07-22 13:00:00+00	ENDED	\N	{928560362922582028,889160472157360160}	0
1397126023266570270	947086484098412564	1264171938625097729	テストA	5	2025-07-22 08:30:00+00	ENDED	{885277218631192638,896758144284360714}	{896758144284360714,885277218631192638}	0
1397126034696175658	947086484098412564	1264171938625097729	テストB	2	2025-07-23 08:50:00+00	CANCELLED	\N	{896758144284360714,885277218631192638,392980108375490580}	0
1397126455758164028	947086484098412564	1264171938625097729	テストB	2	2025-07-22 08:30:00+00	ENDED	{885277218631192638,962004213733396480}	{885277218631192638,392980108375490580,896758144284360714,962004213733396480}	0
1397196508532576307	947086484098412564	1132657645854146570	テスト３	5	2025-07-22 13:00:00+00	ENDED	\N	{928560362922582028,889160472157360160}	0
1397196512253186068	947086484098412564	1132657645854146570	テスト４	2	2025-07-22 13:00:00+00	ENDED	\N	{928560362922582028,889160472157360160}	0
1397108409987366943	947086484098412564	1203247389247541278	テストB	2	2025-07-23 13:00:00+00	ERRORED	\N	{896758144284360714,1077050354501419049,889160472157360160}	0
1397103383915004076	1238401565149364225	1285084876965675058	テスト２	2	2025-07-22 13:00:00+00	ENDED	\N	{}	0
1397103387165851710	1238401565149364225	1285084876965675058	テスト３	5	2025-07-22 13:00:00+00	ENDED	\N	{}	0
1397103390869291088	1238401565149364225	1285084876965675058	テスト４	2	2025-07-22 13:00:00+00	ENDED	\N	{}	0
1397196499636457686	947086484098412564	1132657645854146570	テスト１	2	2025-07-22 13:00:00+00	ENDED	\N	{928560362922582028,889160472157360160}	0
1397376902158614568	947086484098412564	1264171938625097729	ぱんだ	2	2025-07-23 01:06:54.615+00	CANCELLED	\N	{392980108375490580,885277218631192638}	0
1397178870813167768	947086484098412564	1132657645854146570	アロマ	10	2025-07-23 13:00:00+00	RUNNING	\N	{905041393750278185,984991839893487617,928560362922582028,889160472157360160,423194954941071371,979238001680998460,881170724918800414,896758144284360714,961246750381838377,925336202503139358,885277218631192638,891167862125887541,948597070611243028,962004213733396480,960900405775171585,1077050354501419049,904853765704806430,987697180733227068,542361189779505163,1311726285977813036,984301470465818705,950334434098446356,875293135192854538,927949333435932682}	0
1397271984856891527	947086484098412564	1132657645854146570	アロマ	10	2025-07-23 13:00:00+00	ERRORED	\N	{910070206695620620,891167862125887541}	0
1397377368083005503	947086484098412564	1264171938625097729	ぱんだ	2	2025-07-23 00:45:00+00	ENDED	{392980108375490580,885277218631192638}	{392980108375490580,885277218631192638}	0
\.


--
-- Data for Name: guild_configs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.guild_configs (guild_id, main_calendar_id, giveaway_manager_roles) FROM stdin;
1238401565149364225	\N	{1288352766112038995}
947086484098412564	carumaru610@gmail.com	{1381983359957467217}
\.


--
-- Data for Name: notified_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notified_events (event_id, notified_at) FROM stdin;
oo2fhgcjm9sk2rh4fibus60cqo	2025-07-22 17:40:00.983522+00
volrp68lt4pqjomf7uo3b27tij_20250723T033000Z	2025-07-23 03:23:38.464753+00
\.


--
-- Data for Name: reactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reactions (guild_id, channel_id, emojis, trigger) FROM stdin;
947086484098412564	1236536185577410561	1️⃣,2️⃣,❌,👌,🤝	週末土日の雷消化のゆるめアンケートです
947086484098412564	959736404139716668	⭕,❌,❓	土曜21:10～、遺物の戦場
947086484098412564	959736404139716668	⭕,❌,❓,1️⃣,2️⃣	水曜 21:10～侵攻戦＆ダムチャレ
947086484098412564	959736404139716668	⭕,❌,❓	水曜 クロボ後ダムチャレ
947086484098412564	961073840430145576	<:munagedayo:1238401637471748096>	ちゅんちゅん
947086484098412564	959736404139716668	⭕ ,❌ ,❓	王位出欠アンケートです🐼
\.


--
-- Data for Name: scheduled_giveaways; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scheduled_giveaways (id, guild_id, prize, winner_count, giveaway_channel_id, start_time, duration_hours, end_time, schedule_cron, confirmation_channel_id, confirmation_role_id) FROM stdin;
\.


--
-- Name: calendar_monitors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.calendar_monitors_id_seq', 14, true);


--
-- Name: scheduled_giveaways_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.scheduled_giveaways_id_seq', 3, true);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (guild_id, channel_id);


--
-- Name: calendar_monitors calendar_monitors_guild_id_channel_id_trigger_keyword_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_monitors
    ADD CONSTRAINT calendar_monitors_guild_id_channel_id_trigger_keyword_key UNIQUE (guild_id, channel_id, trigger_keyword);


--
-- Name: calendar_monitors calendar_monitors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_monitors
    ADD CONSTRAINT calendar_monitors_pkey PRIMARY KEY (id);


--
-- Name: giveaways giveaways_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.giveaways
    ADD CONSTRAINT giveaways_pkey PRIMARY KEY (message_id);


--
-- Name: guild_configs guild_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guild_configs
    ADD CONSTRAINT guild_configs_pkey PRIMARY KEY (guild_id);


--
-- Name: notified_events notified_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notified_events
    ADD CONSTRAINT notified_events_pkey PRIMARY KEY (event_id);


--
-- Name: reactions reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reactions
    ADD CONSTRAINT reactions_pkey PRIMARY KEY (guild_id, channel_id, trigger);


--
-- Name: scheduled_giveaways scheduled_giveaways_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scheduled_giveaways
    ADD CONSTRAINT scheduled_giveaways_pkey PRIMARY KEY (id);


--
-- PostgreSQL database dump complete
--

