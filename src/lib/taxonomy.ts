/**
 * The canonical activity taxonomy, in one place.
 *
 * XP values live here (and then in the database) rather than scattered through
 * application code, so re-pricing is a data change. Existing logs are unaffected
 * because they snapshot the rate they were scored at — see `scoring_version`.
 *
 * Rate of thumb used below:
 *   16-20  intense focused output (deep work, gym, running)
 *   12-15  skilled cognitive work (engineering, studying, design)
 *    8-11  lighter productive work (admin, planning, chores with upkeep value)
 *    2-7   low-effort or passive time (commuting, shopping, casual reading)
 */

export type SeedActivity = {
  slug: string;
  name: string;
  xp: number;
  icon?: string;
  keywords?: string;
  aliases?: string[];
  children?: SeedActivity[];
};

export type SeedCategory = {
  slug: string;
  name: string;
  icon: string;
  activities: SeedActivity[];
};

const TAXONOMY: SeedCategory[] = [
  {
    slug: "software_development",
    name: "Software Development",
    icon: "💻",
    activities: [
      {
        slug: "software-development",
        name: "Software Development",
        xp: 15,
        icon: "💻",
        keywords: "code coding programming software dev develop building app",
        aliases: [
          "coding",
          "programming",
          "wrote code",
          "writing code",
          "did some programming",
          "software engineering",
          "dev work",
          "built software",
        ],
        children: [
          {
            slug: "frontend-development",
            name: "Frontend Development",
            xp: 15,
            icon: "🎛️",
            keywords: "frontend front end css html client browser component styling",
            aliases: ["frontend", "front end work", "client side development", "web frontend"],
            children: [
              {
                slug: "react-development",
                name: "React Development",
                xp: 15,
                icon: "⚛️",
                keywords: "react nextjs next hooks jsx tsx component",
                aliases: ["react work", "next js development", "reactjs"],
              },
              {
                slug: "vue-development",
                name: "Vue Development",
                xp: 15,
                icon: "🟩",
                keywords: "vue nuxt vuejs composition",
                aliases: ["vue work", "vuejs", "nuxt development"],
              },
              {
                slug: "ui-development",
                name: "UI Development",
                xp: 14,
                icon: "🖼️",
                keywords: "ui interface layout styling tailwind css polish",
                aliases: ["ui work", "styling", "building the ui"],
              },
            ],
          },
          {
            slug: "backend-development",
            name: "Backend Development",
            xp: 15,
            icon: "🧱",
            keywords: "backend back end server api service endpoint microservice",
            aliases: ["backend", "backend work", "back end development", "server side development"],
            children: [
              {
                slug: "api-development",
                name: "API Development",
                xp: 15,
                icon: "🔌",
                keywords: "api rest graphql endpoint route http integration",
                aliases: ["built apis", "api work", "rest api", "graphql work"],
              },
              {
                slug: "database-development",
                name: "Database Development",
                xp: 15,
                icon: "🗄️",
                keywords: "database db sql postgres mysql schema migration query index",
                aliases: ["database work", "sql work", "schema design", "db migration"],
              },
              {
                slug: "server-development",
                name: "Server Development",
                xp: 14,
                icon: "🖥️",
                keywords: "server nginx deployment runtime process daemon",
                aliases: ["server work", "server configuration"],
              },
            ],
          },
          {
            slug: "ai-ml-development",
            name: "AI/ML Development",
            xp: 15,
            icon: "🤖",
            keywords: "ai artificial intelligence ml model training inference neural",
            aliases: [
              "ai work",
              "ai development",
              "worked on ai",
              "ai project",
              "ml work",
              "ai ml",
            ],
            children: [
              {
                slug: "machine-learning",
                name: "Machine Learning",
                xp: 15,
                icon: "📈",
                keywords: "machine learning ml training dataset model pytorch tensorflow sklearn",
                aliases: ["ml", "training a model", "deep learning", "model training"],
              },
              {
                slug: "llm-development",
                name: "LLM Development",
                xp: 15,
                icon: "🧠",
                keywords: "llm gpt claude prompt finetune fine tuning transformer token",
                aliases: ["llm work", "prompt engineering", "fine tuning", "working with llms"],
              },
              {
                slug: "rag-development",
                name: "RAG Development",
                xp: 15,
                icon: "🔎",
                keywords: "rag retrieval embedding vector index chunking semantic search",
                aliases: ["retrieval augmented generation", "rag pipeline", "vector search work"],
              },
              {
                slug: "ai-agents",
                name: "AI Agents",
                xp: 15,
                icon: "🕹️",
                keywords: "agent agents tool use orchestration autonomous workflow mcp",
                aliases: ["ai agent", "agent development", "worked on my agent", "agentic system"],
              },
            ],
          },
          {
            slug: "mobile-development",
            name: "Mobile Development",
            xp: 15,
            icon: "📱",
            keywords: "mobile ios android swift kotlin flutter react native app",
            aliases: ["ios development", "android development", "flutter work", "mobile app work"],
          },
          {
            slug: "devops",
            name: "DevOps & Infrastructure",
            xp: 14,
            icon: "⚙️",
            keywords: "devops docker kubernetes ci cd pipeline deploy infra terraform aws",
            aliases: ["infrastructure work", "ci cd", "deployment work", "docker work", "deployed", "deployed to production", "set up ci", "fixed the build"],
          },
          {
            slug: "debugging",
            name: "Debugging",
            xp: 14,
            icon: "🐛",
            keywords: "debug debugging bug fix error crash troubleshoot investigate",
            aliases: ["fixing bugs", "bug fixing", "troubleshooting", "fixed a bug", "debugged", "debugged an issue"],
          },
          {
            slug: "testing",
            name: "Testing & QA",
            xp: 13,
            icon: "🧪",
            keywords: "test testing unit integration e2e qa coverage spec",
            aliases: ["writing tests", "unit tests", "qa work", "wrote tests"],
          },
          {
            slug: "code-review",
            name: "Code Review",
            xp: 12,
            icon: "🔍",
            keywords: "review pr pull request feedback merge diff",
            aliases: ["reviewing prs", "pull request review", "reviewed code", "paired", "pair programming", "reviewed a pr"],
          },
          {
            slug: "systems-programming",
            name: "Systems Programming",
            xp: 15,
            icon: "🔩",
            keywords: "systems rust c cpp kernel compiler memory performance low level",
            aliases: ["low level programming", "kernel work", "rust systems work"],
          },
          {
            slug: "game-development",
            name: "Game Development",
            xp: 14,
            icon: "🎮",
            keywords: "game unity unreal godot gameplay shader sprite",
            aliases: ["gamedev", "made a game", "unity work"],
          },
          {
            slug: "data-engineering",
            name: "Data Engineering",
            xp: 15,
            icon: "🛠️",
            keywords: "data pipeline etl warehouse spark airflow ingestion analytics",
            aliases: ["etl work", "data pipeline work", "data analysis engineering"],
          },
          {
            slug: "security-engineering",
            name: "Security Engineering",
            xp: 15,
            icon: "🔐",
            keywords: "security pentest vulnerability auth encryption audit hardening ctf",
            aliases: ["security work", "pentesting", "security audit"],
          },
          {
            slug: "hardware-engineering",
            name: "Hardware Engineering",
            xp: 14,
            icon: "🔧",
            keywords: "hardware electronics soldering robotics sensor circuit board",
            aliases: ["electronics work", "hardware project"],
            children: [
              {
                slug: "circuit-design",
                name: "Circuit Design",
                xp: 14,
                icon: "🔌",
                keywords: "circuit schematic analog digital voltage resistor",
                aliases: ["designed a circuit", "schematic design"],
              },
              {
                slug: "pcb-design",
                name: "PCB Design",
                xp: 14,
                icon: "🧿",
                keywords: "pcb board layout kicad altium trace fabrication",
                aliases: ["pcb layout", "designed a pcb", "board design"],
              },
              {
                slug: "embedded-development",
                name: "Embedded Development",
                xp: 15,
                icon: "📟",
                keywords: "embedded firmware microcontroller arduino esp32 stm32 rtos",
                aliases: ["firmware work", "arduino project", "microcontroller programming"],
              },
              {
                slug: "cad-design",
                name: "CAD Design",
                xp: 12,
                icon: "📐",
                keywords: "cad fusion solidworks 3d model print mechanical drawing",
                aliases: ["cad work", "3d modelling", "solidworks"],
              },
            ],
          },
          {
            slug: "technical-writing",
            name: "Technical Writing",
            xp: 11,
            icon: "📝",
            keywords: "documentation docs readme spec technical writing guide",
            aliases: ["writing docs", "documentation work", "wrote a readme"],
          },
        ],
      },
    ],
  },

  {
    slug: "learning",
    name: "Learning",
    icon: "📚",
    activities: [
      {
        slug: "learning",
        name: "Learning",
        xp: 12,
        icon: "📚",
        keywords: "learn learning study education",
        aliases: ["learning something"],
        children: [
          {
            slug: "studying",
            name: "Studying",
            xp: 12,
            icon: "📖",
            keywords: "study studying revision exam lecture notes class course subject",
            aliases: ["studied", "revision", "exam prep", "studying for exams", "assignment", "homework", "coursework"],
          },
          {
            slug: "reading",
            name: "Reading",
            xp: 6,
            icon: "📕",
            keywords: "read reading book novel chapter pages",
            aliases: ["read a book", "reading a novel"],
            children: [
              {
                slug: "technical-reading",
                name: "Technical Reading",
                xp: 9,
                icon: "📘",
                keywords: "paper documentation technical textbook arxiv whitepaper",
                aliases: ["read a paper", "reading documentation", "research paper reading"],
              },
            ],
          },
          {
            slug: "research",
            name: "Research",
            xp: 13,
            icon: "🔬",
            keywords: "research investigate explore analysis literature experiment",
            aliases: ["did research", "researching", "literature review", "thesis", "dissertation"],
          },
          {
            slug: "practice",
            name: "Deliberate Practice",
            xp: 11,
            icon: "🎯",
            keywords: "practice drill repetition rehearse exercises",
            aliases: ["practised", "practiced", "drills"],
          },
          {
            slug: "online-course",
            name: "Online Course",
            xp: 12,
            icon: "🎓",
            keywords: "course tutorial udemy coursera lecture mooc video lesson",
            aliases: ["took a course", "watched a tutorial", "coursera", "lecture", "watched a lecture", "tutorial"],
          },
          {
            slug: "language-learning",
            name: "Language Learning",
            xp: 11,
            icon: "🗣️",
            keywords: "language spanish french japanese german duolingo vocabulary grammar",
            aliases: ["learning spanish", "language practice", "duolingo"],
          },
          {
            slug: "math-practice",
            name: "Mathematics",
            xp: 13,
            icon: "➗",
            keywords: "math maths calculus algebra statistics probability linear proofs",
            aliases: ["did math", "maths practice", "calculus"],
          },
          {
            slug: "dsa-practice",
            name: "DSA & Problem Solving",
            xp: 14,
            icon: "🧩",
            keywords: "dsa leetcode algorithm data structures competitive codeforces puzzle",
            aliases: ["leetcode", "solved problems", "competitive programming", "dsa"],
          },
          {
            slug: "podcast-documentary",
            name: "Podcasts & Documentaries",
            xp: 6,
            icon: "🎧",
            keywords: "podcast documentary episode audiobook listened",
            aliases: ["podcast", "listened to a podcast", "documentary", "audiobook"],
          },
        ],
      },
    ],
  },

  {
    slug: "physical",
    name: "Physical",
    icon: "🏃",
    activities: [
      {
        slug: "physical-activity",
        name: "Physical Activity",
        xp: 14,
        icon: "🏃",
        keywords: "exercise workout physical training fitness",
        aliases: ["exercised", "worked out"],
        children: [
          {
            slug: "walking",
            name: "Walking",
            xp: 8,
            icon: "🚶",
            keywords: "walk walking steps stroll",
            aliases: ["went for a walk", "walked"],
          },
          {
            slug: "running",
            name: "Running",
            xp: 20,
            icon: "🏃",
            keywords: "run running jog jogging sprint marathon km miles",
            aliases: ["went for a run", "ran", "jogging", "went running"],
          },
          {
            slug: "gym",
            name: "Gym",
            xp: 20,
            icon: "🏋️",
            keywords: "gym lifting weights squat bench deadlift reps sets strength",
            aliases: ["gym", "went to the gym", "lifted weights", "weight training", "gym session"],
          },
          {
            slug: "cycling",
            name: "Cycling",
            xp: 16,
            icon: "🚴",
            keywords: "cycle cycling bike biking ride",
            aliases: ["went cycling", "bike ride", "biking", "cycled", "biked"],
          },
          {
            slug: "swimming",
            name: "Swimming",
            xp: 18,
            icon: "🏊",
            keywords: "swim swimming laps pool",
            aliases: ["went swimming", "swam"],
          },
          {
            slug: "sports",
            name: "Sports",
            xp: 15,
            icon: "⚽",
            keywords: "football cricket basketball tennis badminton volleyball match game played",
            aliases: ["played football", "played cricket", "played basketball", "played badminton"],
          },
          {
            slug: "home-workout",
            name: "Home Workout",
            xp: 16,
            icon: "🤸",
            keywords: "home workout calisthenics pushups pullups bodyweight hiit",
            aliases: ["home workout", "calisthenics", "bodyweight training"],
          },
          {
            slug: "yoga",
            name: "Yoga",
            xp: 12,
            icon: "🧘",
            keywords: "yoga asana flow vinyasa pilates",
            aliases: ["did yoga", "yoga session"],
          },
          {
            slug: "hiking",
            name: "Hiking",
            xp: 14,
            icon: "🥾",
            keywords: "hike hiking trek trail mountain walk countryside",
            aliases: ["went hiking", "trekking"],
          },
          {
            slug: "climbing",
            name: "Climbing",
            xp: 18,
            icon: "🧗",
            keywords: "climbing climb bouldering crag belay route",
            aliases: ["bouldering", "rock climbing", "went climbing"],
          },
          {
            slug: "skating",
            name: "Skating",
            xp: 14,
            icon: "🛼",
            keywords: "skating skateboard skate rollerblading",
            aliases: ["skateboarding", "rollerblading", "ice skating"],
          },
          {
            slug: "martial-arts",
            name: "Martial Arts",
            xp: 18,
            icon: "🥋",
            keywords: "karate judo bjj boxing mma taekwondo sparring kickboxing",
            aliases: ["boxing", "bjj", "martial arts training"],
          },
          {
            slug: "stretching",
            name: "Stretching & Mobility",
            xp: 8,
            icon: "🤾",
            keywords: "stretch stretching mobility flexibility warmup foam",
            aliases: ["stretched", "mobility work"],
          },
        ],
      },
    ],
  },

  {
    slug: "creative",
    name: "Creative",
    icon: "🎨",
    activities: [
      {
        slug: "creative-work",
        name: "Creative Work",
        xp: 12,
        icon: "🎨",
        keywords: "creative create making craft",
        aliases: ["creative session"],
        children: [
          {
            slug: "writing",
            name: "Writing",
            xp: 12,
            icon: "✍️",
            keywords: "write writing blog essay article story draft newsletter",
            aliases: ["wrote an article", "blog writing", "wrote a blog post"],
          },
          {
            slug: "design",
            name: "Design",
            xp: 12,
            icon: "🎨",
            keywords: "design figma mockup graphic visual branding illustration layout",
            aliases: ["designed", "figma work", "graphic design", "figma", "wireframes", "mockups"],
          },
          {
            slug: "ux-design",
            name: "UX Design",
            xp: 13,
            icon: "🧭",
            keywords: "ux user experience wireframe prototype flow usability research",
            aliases: ["ux work", "wireframing", "prototyping"],
          },
          {
            slug: "music-practice",
            name: "Music",
            xp: 12,
            icon: "🎸",
            keywords: "music guitar piano singing drums produce instrument band song",
            aliases: ["played guitar", "piano practice", "music production", "made music", "guitar", "piano", "sang"],
          },
          {
            slug: "art",
            name: "Art",
            xp: 11,
            icon: "🖌️",
            keywords: "art draw drawing paint painting sketch illustration",
            aliases: ["drew", "painting", "sketching"],
          },
          {
            slug: "video-editing",
            name: "Video Editing",
            xp: 11,
            icon: "🎬",
            keywords: "video edit editing premiere davinci footage render youtube reel",
            aliases: ["edited a video", "video editing"],
          },
          {
            slug: "photography",
            name: "Photography",
            xp: 10,
            icon: "📷",
            keywords: "photo photography camera shoot lightroom photos",
            aliases: ["photo shoot", "took photos"],
          },
          {
            slug: "content-creation",
            name: "Content Creation",
            xp: 11,
            icon: "📹",
            keywords: "content post reel tiktok youtube instagram thread script filming",
            aliases: ["made content", "filmed a video", "posted content", "reel", "made a reel", "posted a video", "shorts"],
          },
          {
            slug: "pottery",
            name: "Pottery & Ceramics",
            xp: 11,
            icon: "🏺",
            keywords: "pottery ceramics clay kiln glaze throwing wheel sculpting",
            aliases: ["pottery", "potter", "ceramics", "clay work"],
          },
          {
            slug: "textile-craft",
            name: "Knitting & Sewing",
            xp: 10,
            icon: "🧶",
            keywords: "knitting knit crochet sewing sew embroidery quilting stitching yarn",
            aliases: ["knitting", "crochet", "sewing", "embroidery"],
          },
          {
            slug: "woodworking",
            name: "Woodworking",
            xp: 12,
            icon: "🪵",
            keywords: "woodworking woodwork carpentry sawing sanding joinery furniture",
            aliases: ["woodwork", "carpentry"],
          },
          {
            slug: "crafting",
            name: "Crafts & Making",
            xp: 10,
            icon: "🧵",
            keywords: "craft crafts crafting handmade scrapbooking origami jewellery",
            aliases: ["crafting", "made something"],
          },
        ],
      },
    ],
  },

  {
    slug: "work",
    name: "Work & Building",
    icon: "🚀",
    activities: [
      {
        slug: "professional-work",
        name: "Professional Work",
        xp: 12,
        icon: "🚀",
        keywords: "work job office professional",
        // "work"/"working" are stopwords, so a bare "work for 2 hours" has no
        // tokens to rank — it only resolves as a literal alias.
        aliases: ["worked", "work", "working", "did some work", "some work"],
        children: [
          {
            slug: "personal-project",
            name: "Personal Project",
            xp: 15,
            icon: "🛠️",
            keywords: "project side personal portfolio hobby building own",
            aliases: [
              "project", "my project", "side project", "personal project",
              "portfolio", "portfolio site", "my app", "my website", "my blog",
            ],
          },
          {
            slug: "startup-work",
            name: "Startup Work",
            xp: 15,
            icon: "🚀",
            keywords: "startup founder venture product launch building company mvp",
            aliases: ["startup", "startup stuff", "my company", "startup project"],
          },
          {
            slug: "deep-work",
            name: "Deep Work",
            xp: 16,
            icon: "🎯",
            keywords: "deep work focus focused session concentration flow uninterrupted",
            aliases: ["deep work session", "focused work"],
          },
          {
            slug: "product-management",
            name: "Product Management",
            xp: 13,
            icon: "🗺️",
            keywords: "product roadmap spec requirements prioritisation backlog user stories",
            aliases: ["product work", "wrote a spec", "roadmap planning"],
          },
          {
            slug: "business-development",
            name: "Business Development",
            xp: 12,
            icon: "📊",
            keywords: "business strategy partnership growth market analysis competitor",
            aliases: ["biz dev", "business work", "market research"],
          },
          {
            slug: "marketing",
            name: "Marketing",
            xp: 11,
            icon: "📣",
            keywords: "marketing campaign seo ads copy launch audience brand",
            aliases: ["marketing work", "ran a campaign"],
          },
          {
            slug: "sales",
            name: "Sales",
            xp: 11,
            icon: "💼",
            keywords: "sales outreach cold prospect demo deal lead pipeline",
            aliases: ["sales calls", "cold outreach", "sales work"],
          },
          {
            slug: "pitching",
            name: "Pitching & Fundraising",
            xp: 13,
            icon: "🎤",
            keywords: "pitch deck investor fundraising vc demo day",
            aliases: ["pitch practice", "investor meeting", "made a pitch deck"],
          },
          {
            slug: "customer-support",
            name: "Customer Support",
            xp: 10,
            icon: "🎧",
            keywords: "support customer ticket helpdesk user issue response",
            aliases: ["support tickets", "helped customers"],
          },
          {
            slug: "meetings",
            name: "Meetings",
            xp: 6,
            icon: "👥",
            keywords: "meeting call standup sync zoom discussion catch up",
            aliases: ["had a meeting", "team call", "standup", "team meeting", "client call", "1:1", "sync"],
          },
          {
            slug: "admin-email",
            name: "Admin & Email",
            xp: 5,
            icon: "📧",
            keywords: "email admin inbox paperwork forms invoices scheduling",
            aliases: ["cleared my inbox", "admin work", "answered emails", "replied to emails", "emails", "inbox"],
          },
          {
            slug: "planning",
            name: "Planning & Reflection",
            xp: 10,
            icon: "🗓️",
            keywords: "plan planning review reflect goals weekly organise strategy notes",
            aliases: ["planned my week", "weekly review", "goal setting"],
          },
          {
            slug: "freelancing",
            name: "Freelance & Client Work",
            xp: 14,
            icon: "🧾",
            keywords: "freelance client contract deliverable gig invoice",
            aliases: ["client work", "freelance project", "client project", "client projects"],
          },
          {
            slug: "interview-prep",
            name: "Interview Prep",
            xp: 12,
            icon: "🎙️",
            keywords: "interview prep mock behavioural preparation questions",
            aliases: ["interview preparation", "mock interview", "interview", "gave an interview", "interviews", "interview prep", "prepared for interviews"],
          },
          {
            slug: "job-applications",
            name: "Job Applications",
            xp: 8,
            icon: "📮",
            keywords: "job application resume cv cover letter applied internship",
            aliases: ["applied for jobs", "updated my resume"],
          },
        ],
      },
    ],
  },

  {
    slug: "wellness",
    name: "Wellness",
    icon: "🧘",
    activities: [
      {
        slug: "wellness",
        name: "Wellness",
        xp: 10,
        icon: "🧘",
        keywords: "wellness wellbeing self care mental health",
        aliases: ["self care"],
        children: [
          {
            slug: "meditation",
            name: "Meditation",
            xp: 12,
            icon: "🧘",
            keywords: "meditate meditation mindfulness breathing calm headspace",
            aliases: ["meditated", "mindfulness practice"],
          },
          {
            slug: "journaling",
            name: "Journaling",
            xp: 10,
            icon: "📓",
            keywords: "journal journaling diary reflection gratitude morning pages",
            aliases: ["journaled", "wrote in my journal"],
          },
          {
            slug: "therapy",
            name: "Therapy",
            xp: 10,
            icon: "💬",
            keywords: "therapy therapist counselling session mental",
            aliases: ["therapy session"],
          },
          {
            slug: "breathwork",
            name: "Breathwork",
            xp: 10,
            icon: "🌬️",
            keywords: "breathwork breathing pranayama wim hof",
            aliases: ["breathing exercises"],
          },
        ],
      },
    ],
  },

  {
    slug: "life",
    name: "Life",
    icon: "🏠",
    activities: [
      {
        slug: "life-admin",
        name: "Life",
        xp: 6,
        icon: "🏠",
        keywords: "life household home personal",
        aliases: ["life stuff"],
        children: [
          {
            slug: "eating",
            name: "Eating & Meals",
            xp: 2,
            icon: "🍽️",
            keywords: "eat meal lunch dinner breakfast food snack",
            aliases: ["ate", "had lunch", "had dinner", "had breakfast", "lunch", "dinner", "breakfast"],
          },
          {
            slug: "cooking",
            name: "Cooking",
            xp: 7,
            icon: "🍳",
            keywords: "cook cooking meal food recipe baking dinner lunch breakfast",
            aliases: ["cooked dinner", "made food", "baking"],
          },
          {
            slug: "meal-prep",
            name: "Meal Prep",
            xp: 7,
            icon: "🥗",
            keywords: "meal prep batch cooking groceries portions",
            aliases: ["meal prepped"],
          },
          {
            slug: "personal-care",
            name: "Personal Care",
            xp: 2,
            icon: "🪥",
            keywords: "shower hygiene grooming skincare haircut self care",
            aliases: ["showered", "shower", "brushed my teeth", "skincare", "got ready"],
          },
          {
            slug: "cleaning",
            name: "Cleaning",
            xp: 6,
            icon: "🧹",
            keywords: "clean cleaning tidy laundry dishes vacuum organise room",
            aliases: ["cleaned my room", "tidied up", "did laundry"],
          },
          {
            slug: "shopping",
            name: "Shopping",
            xp: 4,
            icon: "🛒",
            keywords: "shop shopping groceries store buy mall market",
            aliases: ["went shopping", "grocery shopping"],
          },
          {
            slug: "errands",
            name: "Errands",
            xp: 5,
            icon: "🧭",
            keywords: "errand bank post office appointment chores pickup",
            aliases: ["ran errands", "did chores"],
          },
          {
            slug: "commuting",
            name: "Commuting",
            xp: 2,
            icon: "🚌",
            keywords: "commute travel train bus drive traffic transit",
            aliases: ["commuted", "travelled to work"],
          },
          {
            slug: "personal-finance",
            name: "Personal Finance",
            xp: 8,
            icon: "💰",
            keywords: "finance budget expenses taxes savings investment accounts",
            aliases: ["did my budget", "sorted my finances", "filed taxes", "paid bills", "paid my bills", "budgeting"],
          },
          {
            slug: "gardening",
            name: "Gardening",
            xp: 8,
            icon: "🪴",
            keywords: "garden gardening plants weeding soil planting lawn mowing",
            aliases: ["gardening", "watered the plants", "yard work"],
          },
          {
            slug: "pet-care",
            name: "Pet Care",
            xp: 7,
            icon: "🐕",
            keywords: "pet dog cat feeding grooming vet puppy litter",
            aliases: ["walked the dog", "fed the dog", "pet care"],
          },
          {
            slug: "home-maintenance",
            name: "Home Maintenance",
            xp: 8,
            icon: "🔨",
            keywords: "repair repairs fixing maintenance assembling plumbing wiring",
            aliases: ["home repairs", "fixed something", "assembled furniture"],
          },
          {
            slug: "childcare",
            name: "Childcare",
            xp: 8,
            icon: "🧸",
            keywords: "kids children babysitting childcare baby parenting nursery",
            aliases: ["looked after the kids", "babysitting"],
          },
        ],
      },
    ],
  },

  /**
   * Rest and passive leisure are *tracked* but barely *scored*.
   *
   * Sleep is deliberately 0 XP/h. Everyone sleeps, so paying XP for it would
   * hand out a guaranteed daily income for existing — and at any rate above
   * ~1.5 XP/h an eight-hour night alone would clear the 10 XP streak threshold,
   * which would make streaks meaningless. Logging it still earns you the time
   * breakdown on your profile.
   *
   * Passive entertainment is scored low rather than zero: it's real time you
   * chose to spend, and hiding it from yourself defeats the point of tracking.
   */
  {
    slug: "rest",
    name: "Rest & Leisure",
    icon: "😴",
    activities: [
      {
        slug: "rest-leisure",
        name: "Rest & Leisure",
        xp: 1,
        icon: "😴",
        keywords: "leisure downtime unwind break",
        aliases: ["downtime"],
        children: [
          {
            slug: "sleep",
            name: "Sleep",
            xp: 0,
            icon: "😴",
            keywords: "sleep sleeping slept nap napping bedtime overnight",
            aliases: ["sleep", "sleeping", "slept", "napping", "took a nap", "went to bed"],
          },
          {
            slug: "resting",
            name: "Rest",
            xp: 0,
            icon: "🛋️",
            keywords: "rest resting relax relaxing chill chilling lounging recovering",
            aliases: ["rested", "relaxing", "chilling", "took a break"],
          },
          {
            slug: "gaming",
            name: "Gaming",
            xp: 3,
            icon: "🎮",
            keywords: "gaming console playstation xbox steam valorant minecraft fifa",
            aliases: ["gaming", "video games", "played games", "played video games", "valorant", "minecraft", "fifa", "cod", "chess"],
          },
          {
            slug: "watching",
            name: "Watching TV & Film",
            xp: 2,
            icon: "📺",
            keywords: "netflix television show movie film series episode binge",
            aliases: ["watched a movie", "watched tv", "watched a show", "netflix"],
          },
          {
            slug: "browsing",
            name: "Browsing & Social Media",
            xp: 1,
            icon: "📱",
            keywords: "browsing scrolling instagram twitter reddit tiktok feed",
            aliases: ["scrolling", "social media", "browsing"],
          },
        ],
      },
    ],
  },

  {
    slug: "social",
    name: "Social",
    icon: "🤝",
    activities: [
      {
        slug: "social-time",
        name: "Social",
        xp: 6,
        icon: "🤝",
        keywords: "social people hangout together",
        aliases: ["socialised", "socialized"],
        children: [
          {
            slug: "friends",
            name: "Time with Friends",
            xp: 6,
            icon: "🧑‍🤝‍🧑",
            keywords: "friends hangout hung out mates catch up party dinner",
            aliases: ["hung out with friends", "met friends", "hanging out"],
          },
          {
            slug: "family",
            name: "Family Time",
            xp: 7,
            icon: "👨‍👩‍👧",
            keywords: "family parents mom dad siblings home relatives",
            aliases: ["spent time with family", "family dinner", "called my parents"],
          },
          {
            slug: "networking",
            name: "Networking",
            xp: 9,
            icon: "🌐",
            keywords: "networking event meetup conference connect linkedin coffee chat",
            aliases: ["went to a meetup", "networking event", "coffee chat", "meetup", "attended a meetup", "conference"],
          },
          {
            slug: "community",
            name: "Community & Volunteering",
            xp: 10,
            icon: "🫶",
            keywords: "community volunteer club society ngo organising charity",
            aliases: ["volunteered", "community work", "club activities"],
          },
          {
            slug: "mentoring",
            name: "Mentoring & Teaching",
            xp: 12,
            icon: "🧑‍🏫",
            keywords: "mentor teaching taught tutor explain helped junior guidance",
            aliases: ["mentored someone", "taught a class", "tutoring"],
          },
        ],
      },
    ],
  },
];

/** Flattened view used by the seeder and by tests. */
export function flattenTaxonomy() {
  const rows: {
    slug: string;
    name: string;
    xp: number;
    icon: string;
    keywords: string;
    aliases: string[];
    category: string;
    parentSlug: string | null;
    depth: number;
  }[] = [];

  for (const category of TAXONOMY) {
    const walk = (node: SeedActivity, parentSlug: string | null, depth: number) => {
      rows.push({
        slug: node.slug,
        name: node.name,
        xp: node.xp,
        icon: node.icon ?? category.icon,
        keywords: node.keywords ?? "",
        aliases: node.aliases ?? [],
        category: category.slug,
        parentSlug,
        depth,
      });
      for (const child of node.children ?? []) walk(child, node.slug, depth + 1);
    };
    for (const activity of category.activities) walk(activity, null, 0);
  }
  return rows;
}
