======================================================================
ASSESSOR MAP QA & REVIEW TOOL - SETUP GUIDE
======================================================================

A browser-based collaborative map review application built for County 
Assessor and GIS teams. Reviewers can upload assessor map PDFs, organize 
them into user folders, place vector markups (pins, lines, arrows, 
circles, highlights, polygons, and rotated text), attach screenshots or 
reference files, reply in threaded comments, and track multi-reviewer 
sign-offs in real time.

The frontend is 100% static HTML/JavaScript (no build step or server 
required) and connects directly to a free Supabase backend.


PREREQUISITES
----------------------------------------------------------------------
Before starting, you will need:
1. A GitHub account (to host the website for free via GitHub Pages).
2. A Supabase account (free tier is sufficient for a county team).
3. OAuth credentials from your county's IT provider for staff login 
   (Google Workspace and/or Microsoft 365 / Azure Entra ID).


STEP 1: FORK THIS REPOSITORY
----------------------------------------------------------------------
1. Log in to GitHub and navigate to the main page of this repository.
2. Click the "Fork" button in the top-right corner.
3. Choose your personal or county GitHub account as the Owner, optionally 
   rename the repository (e.g., deschutes-map-reviewer), and click 
   "Create fork".

Note: Free GitHub accounts require the repository to be Public to use 
GitHub Pages. No sensitive secrets are stored in the repository. Database 
access is locked down by Supabase Row Level Security (RLS) to your 
county's email domain.


STEP 2: SET UP THE SUPABASE BACKEND
----------------------------------------------------------------------
1. Go to database.new and sign in to create a new Supabase project.
2. Give the project a name (e.g., County Map Reviewer), generate a strong 
   database password, choose a nearby region, and click "Create new project".
3. Once the project finishes provisioning, open "SQL Editor" in the left 
   sidebar and click "New query".
4. Open "setup.sql" from this repository, copy the entire file, and 
   paste it into the Supabase SQL Editor.
5. Update your county email domain on line 14:
   
   CREATE OR REPLACE FUNCTION public.get_county_email_domain()
   RETURNS text
   LANGUAGE sql
   IMMUTABLE
   AS $$
     SELECT lower(trim('@yourcounty.gov'))::text;
   $$;

6. Click "Run". 
7. If Supabase displays a "Potential issue detected" dialog warning about 
   Row Level Security, click "Run without RLS". 
   (Supabase flags the CREATE TABLE statements at the top, but Section 10 
   automatically enables RLS and secures everything right after).
8. Go to "Project Settings" (gear icon) -> "API", and copy two values 
   for Step 5:
   * Project URL (e.g., https://abcdefg.supabase.co)
   * Publishable / anon public key


STEP 3: DEPLOY THE WEBSITE WITH GITHUB PAGES
----------------------------------------------------------------------
1. Open your forked repository on GitHub and click "Settings".
2. In the left sidebar, click "Pages".
3. Under "Build and deployment":
   * Set Source to "Deploy from a branch".
   * Under Branch, select "main" and "/ (root)", then click "Save".
4. Wait 1-2 minutes and refresh the page. Your live site URL will appear 
   at the top (e.g., https://your-username.github.io/your-repo-name/).
   Copy this URL for the next step.


STEP 4: CONFIGURE STAFF LOGIN
----------------------------------------------------------------------
A. Add Redirect URLs in Supabase
1. In your Supabase Dashboard, go to "Authentication" -> "URL Configuration".
2. Set "Site URL" to your GitHub Pages URL from Step 3.
3. Under "Redirect URLs", click "Add URL" and add both:
   * https://your-username.github.io/your-repo-name/
   * https://your-username.github.io/your-repo-name/**
4. Click "Save".

B. Enable Your Auth Provider
1. In Supabase, go to "Authentication" -> "Providers".
2. Copy the "Callback URL (for OAuth)" shown at the top of your provider:
   * Google: Create an OAuth 2.0 Client ID in the Google Cloud Console, 
     paste the Supabase Callback URL into "Authorized redirect URIs", 
     and copy the Client ID and Client Secret back into Supabase.
   * Azure (Microsoft 365): Register an app in the Microsoft Entra Admin 
     Center, add the Supabase Callback URL as a "Web" redirect URI, 
     generate a Client Secret, and paste the Application ID, Secret Value, 
     and Tenant URL back into Supabase.
3. Toggle the provider ON and click "Save".


STEP 5: CUSTOMIZE YOUR COUNTY CONFIGURATION
----------------------------------------------------------------------
All county-specific settings live in one configuration block at the top 
of "javascript/helpers.js". Edit this file directly on GitHub by 
clicking the pencil icon. 

Update these settings to match your team:

* SUPABASE_URL: Your Project URL from Step 2.8 
  (e.g., "https://xyz.supabase.co")
* SUPABASE_KEY: Your Publishable anon key from Step 2.8 
  (e.g., "sb_publishable_...")
* AUTH_PROVIDER: Login buttons to display 
  ('google', 'azure', or 'both')
* DEFAULT_EMAIL_DOMAIN: Your county email domain 
  ('@yourcounty.gov')
* EXPLICIT_ALLOWED_EMAILS: Allowlist of staff emails permitted to sign in 
  (["jane.doe@yourcounty.gov", ...])
* REVIEWER_SORT_ORDER: Display order of reviewer badges 
  (['jane.doe', 'john.smith'])
* USER_COLORS: Hex badge/label color per reviewer 
  ({ 'jane.doe': '#249fb3' })
* NAME_CASING_OVERRIDES: Exact display name formatting per email 
  ({ 'mckenzie.bowey@yourcounty.gov': 'McKenzie' })
* REVIEWER_INITIALS: Custom 2-letter initials shown inside reviewer circles 
  ({ 'jane.doe@yourcounty.gov': 'JD' })
* GIS_LAYERS_REGISTRY: Dropdown list of GIS layers available 
  (["Tax Lots", "Easements", ...])

Once you commit your changes to the main branch, GitHub Pages will 
automatically update your live website within about 60 seconds.


TROUBLESHOOTING
----------------------------------------------------------------------
* "Access Denied" or blank map list after signing in: 
  Verify that the email domain in DEFAULT_EMAIL_DOMAIN matches the 
  domain set inside public.get_county_email_domain() in Supabase, and 
  that the user's full email is listed in EXPLICIT_ALLOWED_EMAILS.

* Login redirects back to localhost or fails after OAuth: 
  Double-check that your exact GitHub Pages URL (including trailing slash) 
  is saved under Authentication -> URL Configuration -> Site URL and 
  Redirect URLs in Supabase.

* PDFs or screenshots fail to upload: 
  Confirm that both "assessor-maps" and "issue_files" appear under 
  Storage -> Buckets in Supabase and are marked Public.