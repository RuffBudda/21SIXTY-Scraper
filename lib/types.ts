// LinkedIn-specific types
export interface ExperienceItem {
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string | null;
  description?: string;
  duration?: string;
}

export interface EducationItem {
  school: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface Recommendation {
  recommender: string;
  relationship?: string;
  text?: string;
}

// Platform type detection
export type PlatformType = 'linkedin' | 'instagram' | 'website';

// LinkedIn Profile Data
export interface LinkedInProfileData {
  platform: 'linkedin';
  url: string;
  name: string;
  headline: string;
  location: string;
  about: string;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: string[];
  languages: string[];
  recommendations: Recommendation[];
  connections?: string;
  profileImage?: string;
}

// Instagram Profile Data
export interface InstagramProfileData {
  platform: 'instagram';
  url: string;
  username: string;
  fullName?: string;
  biography?: string;
  profileImage?: string;
  followers?: string;
  following?: string;
  posts?: string;
  isVerified?: boolean;
  isPrivate?: boolean;
  isBusinessAccount?: boolean;
  category?: string;
  website?: string;
  highlights?: Array<{
    title: string;
    coverImage?: string;
  }>;
  recentPosts?: Array<{
    imageUrl?: string;
    caption?: string;
    likes?: string;
    comments?: string;
    timestamp?: string;
  }>;
}

// Website/Person Data (extracted from any website)
export interface WebsitePersonData {
  platform: 'website';
  url: string;
  title?: string;
  name?: string;
  description?: string;
  email?: string;
  phone?: string;
  location?: string;
  jobTitle?: string;
  company?: string;
  socialLinks?: Array<{
    platform: string;
    url: string;
  }>;
  images?: string[];
  textContent?: string;
  metadata?: {
    [key: string]: string;
  };
  structuredData?: {
    [key: string]: any;
  };
}

// Unified Profile Data type
export type ProfileData = LinkedInProfileData | InstagramProfileData | WebsitePersonData;

export interface ScrapeResponse {
  success: boolean;
  platform?: PlatformType;
  data?: ProfileData;
  error?: string;
  timestamp: string;
  url: string;
}
