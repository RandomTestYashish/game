// Product analytics through PostHog (https://posthog.com/docs/libraries/js).
//
// Off unless js/config.js holds a PostHog *project* key (it starts "phc_" and,
// like the Supabase publishable key, is meant to be public). A personal API
// key ("phx_") is refused, so one pasted by mistake is never shipped.
//
// Only the game's own events are sent (see track() calls in main.js), with
// numbers such as court and score: no player names, no autocaptured clicks,
// no session recordings. Nothing is sent from localhost unless the config
// asks for it. Every call is wrapped so a blocked or failing analytics script
// can never break the game.

import { CONFIG } from './config.js';

const key = String(CONFIG.posthogKey || '');
const host = String(CONFIG.posthogHost || 'https://us.i.posthog.com').replace(/\/+$/, '');
const local = /^(localhost|127\.|\[::1\]$)/.test(location.hostname);

export const analyticsEnabled = () =>
  key.startsWith('phc_') && /^https:\/\/[a-z0-9.-]+$/i.test(host) && (!local || CONFIG.posthogLocal === true);

let started = false;

function start() {
  if (started) return;
  started = true;
  /* eslint-disable */
  // The official PostHog HTML snippet, unchanged: it queues calls until the
  // library (array.js, fetched from the PostHog host) has loaded.
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  /* eslint-enable */
  window.posthog.init(key, {
    api_host: host,
    defaults: '2026-05-30',
    person_profiles: 'identified_only', // players are anonymous; nobody is identified
    autocapture: false, // the game is one canvas: page clicks say nothing
    capture_dead_clicks: false,
    capture_heatmaps: false,
    disable_session_recording: true,
    disable_surveys: true,
  });
}

// Load PostHog (and send the page view) once, at boot.
export function initAnalytics() {
  if (!analyticsEnabled()) return;
  try {
    start();
  } catch {
    /* analytics unavailable: the game carries on */
  }
}

// Send one event. Never throws.
export function track(event, props = {}) {
  if (!analyticsEnabled()) return;
  try {
    start();
    window.posthog.capture(event, props);
  } catch {
    /* analytics unavailable: the game carries on */
  }
}
