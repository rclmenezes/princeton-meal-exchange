export function isDevelopmentDemoMode(
  nodeEnv = process.env.NODE_ENV,
  configuredValue = process.env.DEV_DEMO_MODE,
) {
  return nodeEnv !== "production" && configuredValue === "true";
}

export const DEMO_USER = {
  id: "demo-aum",
  name: "Aum Dhruv",
  email: "aum@princeton.edu",
  eligible: true,
  homeEstablishmentId: null,
};

export const DEMO_LOCATIONS = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Butler College",
    type: "dining_hall" as const,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Forbes College",
    type: "dining_hall" as const,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    name: "Whitman College",
    type: "dining_hall" as const,
  },
  {
    id: "20000000-0000-4000-8000-000000000001",
    name: "Cottage Club",
    type: "eating_club" as const,
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    name: "Terrace Club",
    type: "eating_club" as const,
  },
] as const;

export const DEMO_STUDENTS = [
  {
    id: "demo-maya",
    name: "Maya Hernandez",
    email: "maya@princeton.edu",
    eligible: true,
    homeEstablishmentId: "20000000-0000-4000-8000-000000000001",
  },
  {
    id: "demo-julian",
    name: "Julian Park",
    email: "julian@princeton.edu",
    eligible: true,
    homeEstablishmentId: null,
  },
  {
    id: "demo-sam",
    name: "Sam Rivera",
    email: "sam@princeton.edu",
    eligible: true,
    homeEstablishmentId: "20000000-0000-4000-8000-000000000002",
  },
  {
    id: "demo-ineligible",
    name: "Taylor Morgan",
    email: "taylor@princeton.edu",
    eligible: false,
    homeEstablishmentId: null,
  },
] as const;
