# Deployment & Operations Guide

## Overview

This guide provides comprehensive instructions for deploying, operating, and maintaining the market-leading Trend-Equity platform with the new swipe-based discovery system. It covers production deployment, monitoring, maintenance, and ongoing optimization.

## Production Deployment

### 1. Environment Preparation

#### Prerequisites

```bash
# Required tools and versions
node >= 22 LTS
pnpm >= 8.0
vercel CLI >= 3.0
ssh access to production servers
doppler CLI configured
AWS CLI configured (for S3, CloudFront)
Firebase CLI configured
Stripe CLI configured
```

#### Environment Setup

```bash
# 1. Configure Doppler for production secrets
export DOPPLER_PROJECT=trend-equity
export DOPPLER_CONFIG=prd

# 2. Download production secrets
doppler run --env ".env.prd" -- do not-backup

# 3. Configure Vercel environment variables
vercel env add GEMINI_API_KEY production
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_PRICE_PRO production
vercel env add STRIPE_PRICE_BUILDER production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add FIREBASE_SERVICE_ACCOUNT_KEY production
vercel env add APP_URL production
```

### 2. Application Deployment

#### Local Development Setup

```bash
# 1. Clone and checkout main branch
git clone https://github.com/your-org/trend-equity.git
cd trend-equity

git checkout main

# 2. Install dependencies
pnpm install

# 3. Configure environment
# Copy and configure .env.example
# Set required environment variables

cp .env.example .env
# Edit .env with development values

# 4. Start application (using Doppler for secrets)
doppler login
doppler setup --project trend-equity --config dev
doppler run -- npm run dev:mock
```

#### Production Build

```bash
# 1. Local production build
npm run build

# 2. Build optimizations
npm run format
npm run eslint:fix
npm run typecheck

# 3. Vercel deployment
vercel --prod --yes

# 4. Production environment setup
vercel env ls
# Review and add any missing variables

# 5. Deploy with production configuration
vercel deploy --prod --yes
```

### 3. Database and Configuration

#### Firestore Setup

```bash
# 1. Initialize Firebase project
firebase login
firebase use trend-equity-prd

# 2. Set up Firestore collections and indexes
# Run these scripts from scripts/ directory

# Collections
firebase deploy --only firestore

# Security rules (most critical)
# Review and deploy in production only
# 1. Run the following script to configure production security rules:

# Security rules from firestore.rules (production-tested)
cat > scripts/deploy-firestore-rules.sh << 'EOF'
#!/bin/bash
set -e

echo "Deploying Firestore security rules..."

# Backup existing rules (if any)
if [ -f firestore.rules ]; then
  cp firestore.rules firestore.rules.backup
fi

# Apply security rules (production version only)
# Review rules/security in decisions.md before deploying

firebase deploy --only firestore:rules

# Verify deployment
echo "Firestore rules deployed successfully"
EOF

chmod +x scripts/deploy-firestore-rules.sh

# Execute safely with confirmation
./scripts/deploy-firestore-rules.sh

# 2. Create production data structures
# Use scripts/initialize-production-data.sh

# Security-critical: Never run initialization scripts with live data
# Use only in isolated test environments

# 3. Configure production-specific indexes
# Verify indexes in firestore.indexes.json
# Deploy only non-query indexes for production

cat > scripts/deploy-firestore-indexes.sh << 'EOF'
#!/bin/bash
set -e

echo "Deploying Firestore indexes..."

# Validate indexes before deploying
npx firestore-indexer validate --project trend-equity-prd

# Deploy only safe indexes
firebase deploy --only firestore:indexes

echo "Firestore indexes deployed successfully"
EOF

chmod +x scripts/deploy-firestore-indexes.sh
./scripts/deploy-firestore-indexes.sh
```

#### Stripe Configuration

```bash
# 1. Configure Stripe products and prices
stripe products create --name "Trend-Equity Pro" --description "Pro plan: 25 ideas/day" --price-data currency:usd amount:900 type:recurring bill_period anchor=month

STRIPE_PRICE_PRO=$(stripe products describe --id price_pro_id --expand prices | jq -r '.data[0].prices[0].id')

echo "STRIPE_PRICE_PRO=$STRIPE_PRICE_PRO" >> .env.local

# 2. Create Builder product
stripe products create --name "Trend-Equity Builder" --description "Builder plan: 35 ideas/day + custom feeds" --price-data currency:usd amount:1900 type:recurring bill_period anchor=month

STRIPE_PRICE_BUILDER=$(stripe products describe --id price_builder_id --expand prices | jq -r '.data[0].prices[0].id')

echo "STRIPE_PRICE_BUILDER=$STRIPE_PRICE_BUILDER" >> .env.local

# 3. Configure Customer Portal
npm run stripe:configure-portal

# 4. Verify configuration
npm run stripe:verify
```

## Monitoring and Observability

### 1. Application Monitoring

#### Vercel Monitoring Setup

```bash
# 1. Enable production monitoring
vercel env add VERCEL_ENV production

# 2. Configure analytics and monitoring
# Add to vercel.json
cat >> vercel.json << 'EOF'
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/$1"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ],
  "environmentVariables": {
    "VERCEL_ENV": "production"
  }
}
EOF

# 2. Vercel Analytics setup
# Configure Vercel Analytics for production performance monitoring
# https://vercel.com/analytics
```

#### Application Performance Monitoring

```bash
# 1. Install monitoring dependencies
pnpm add -D @vercel/speed-insights @vercel/analytics

# 2. Initialize monitoring in layout.tsx
'use client'

import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
```

### 2. Log Management

#### Centralized Logging

```bash
# 1. Configure structured logging
# Add to api/_lib/ to use winston/pino for structured logging

# 2. Set up log aggregation
# Configure for:
# - Application logs
# - Error tracking
# - Performance metrics
# - User behavior analytics

# 3. Log retention and cleanup
# Configure log rotation and retention policies
# Implement log compression for storage efficiency
```

### 3. Performance Monitoring

#### Real-time Performance Metrics

```bash
# 1. Set up performance monitoring
# Use Vercel Speed Insights for:
# - Largest Contentful Paint (LCP)
# - First Input Delay (FID)
# - Cumulative Layout Shift (CLS)
# - Time to First Byte (TTFB)

# 2. Application Performance Monitoring (APM)
# Implement custom APM for:
# - API response times
# - Database query performance
# - Cache hit rates
# - Error tracking and alerting

# 3. Performance budgets
# Set targets:
# - Bundle size: < 500KB
# - Page load: < 1 second
# - API response: < 200ms
# - Memory usage: < 100MB
```

## Security Operations

### 1. Security Hardening

#### Production Security Configuration

```bash
# 1. Security headers configuration
# Add to vercel.json headers

cat >> vercel.json << 'EOF'
"headers": [
  {
    "source": "/(.*)",
    "headers": [
      {
        "key": "Content-Security-Policy",
        "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.trend-equity.com; frame-ancestors 'none'"
      },
      {
        "key": "Referrer-Policy",
        "value": "strict-origin-when-cross-origin"
      },
      {
        "key": "Permissions-Policy",
        "value": "camera=(), microphone=(), geolocation=()"
      }
    ]
  }
]
EOF

# 2. API security
# Configure rate limiting for all API endpoints
# Implement API key validation where needed
# Set up WAF (Web Application Firewall)

# 3. Authentication and authorization
# Firebase authentication configuration
# Role-based access control setup
# Admin-only route protection
```

### 2. Incident Response

#### Security Incident Protocol

```bash
# 1. Security monitoring setup
# Configure alerts for:
# - Failed authentication attempts
# - API rate limiting violations
# - Suspicious API calls
# - Security rule violations

# 2. Incident response playbook
# Create response procedures for:
# - Data breaches
# - Security rule violations
# - API abuse
# - Unauthorized access

# 3. Post-incident analysis
# Configure logging for:
# - Security event reconstruction
# - Root cause analysis
# - Remediation verification
# - Prevention measures
```

## Maintenance Operations

### 1. Daily Operations

#### Routine Maintenance Tasks

```bash
# 1. Daily monitoring
crontab -e
# Add daily monitoring jobs

# Backup application state
0 2 * * * /path/to/scripts/backup-application.sh

# Check system health
*/5 * * * * /path/to/scripts/health-check.sh

# Monitor performance metrics
*/10 * * * * /path/to/scripts/performance-monitor.sh

# 2. Log rotation
# Configure daily log rotation
# Implement log compression and archival

# 3. Security scanning
# Run security vulnerability scans
# Update dependency security advisories
# Check for configuration drift
```

### 2. Weekly Maintenance

#### Scheduled Maintenance

```bash
# 1. Weekly backups
# Monday at 2:00 AM
# Full application backup
# Database snapshot
# Configuration backup

# 2. Performance review
# Weekly performance analysis
# Identify degradation trends
# Plan capacity upgrades

# 3. Security update
# Weekly security patch review
# Critical vulnerability fixes
# Security rule updates

# 4. Backup verification
# Weekly backup integrity check
# Restore test procedures
# Recovery time validation
```

### 3. Monthly Operations

#### Monthly Review and Maintenance

```bash
# 1. Monthly security audit
# Comprehensive security review
# Penetration testing (if applicable)
# Compliance verification

# 2. Performance optimization
# Review and optimize queries
# Update indexes where needed
# Clean up unused resources

# 3. Cost analysis
# Review cloud usage
# Identify optimization opportunities
# Rightsize resources

# 4. Documentation updates
# Update operational procedures
# Document configuration changes
# Update contact information
```

## Disaster Recovery

### 1. Backup Strategy

#### Backup Configuration

```bash
# 1. Application backup strategy
# Daily: Partial backups (critical user data)
# Weekly: Full backups (complete application state)
# Monthly: Archive backups (long-term retention)

# 2. Database backup strategy
# Real-time: Point-in-time recovery
# Daily: Daily snapshots
# Weekly: Weekly archives

# 3. Configuration backup strategy
# Version control for all configurations
# External storage for critical secrets
# Automated backup validation
```

### 2. Recovery Procedures

#### Disaster Recovery Plan

```bash
# 1. Disaster recovery testing
# Monthly recovery drills
# Quarterly full recovery tests
# Annual business continuity exercises

# 2. Recovery time objectives (RTO)
# < 4 hours for partial restoration
# < 24 hours for complete restoration

# 3. Recovery point objectives (RPO)
# < 1 hour for critical systems
# < 24 hours for non-critical systems

# 4. Recovery procedures
# Step-by-step recovery instructions
# Contact lists and communication plans
# Recovery validation checklists
# Post-recovery analysis
```

## Performance Optimization

### 1. Database Optimization

#### Query Optimization

```sql
# 1. Index optimization
# Review and add missing indexes
# Remove unused indexes
# Monitor query performance

# 2. Query refactoring
# Optimize frequently called queries
# Implement proper joins
# Use appropriate data types

# 3. Connection pool optimization
# Adjust pool sizes based on load
# Implement connection pooling
# Monitor connection health
```

### 2. Application Optimization

#### Cache Strategy Optimization

```bash
# 1. Redis/Memcached configuration
# Set appropriate TTL values
# Configure cache eviction policies
# Monitor cache hit/miss ratios

# 2. Application-level caching
# Implement result caching
# Configure cache invalidation
# Monitor cache effectiveness

# 3. CDN optimization
# Configure edge caching
# Optimize static asset delivery
# Implement cache headers
```

### 3. Code Optimization

#### Performance Monitoring

```javascript
// Example performance monitoring in critical paths
const performanceMonitor = {
  recordMetric: (name, value, tags = {}) => {
    // Send to monitoring system
    console.log(`Metric: ${name}, Value: ${value}, Tags: ${JSON.stringify(tags)}`);
  },

  startTimer: (name) => {
    console.time(name);
  },

  endTimer: (name) => {
    console.timeEnd(name);
  },
};

// Usage in performance-critical code
performanceMonitor.startTimer('swipe-animation');
const result = performSwipeAnimation();
performanceMonitor.endTimer('swipe-animation');
performanceMonitor.recordMetric('swipe-duration', result.duration, { cardType: result.type });
```

## Continuous Improvement

### 1. A/B Testing Framework

#### Experiment Management

```typescript
// Example A/B testing implementation
interface ABTest {
  id: string;
  name: string;
  variants: ABTestVariant[];
  trafficAllocation: number;
  startDate: Date;
  endDate: Date;
  goals: ABTestGoal[];
}

interface ABTestVariant {
  id: string;
  name: string;
  trafficPercent: number;
  implementation: React.ComponentType;
}

// Example usage
const swipeCarouselTest: ABTest = {
  id: 'swipe-carousel-2026-11',
  name: 'Swipe Carousel Optimization',
  variants: [
    {
      id: 'control',
      name: 'Current Implementation',
      trafficPercent: 50,
      implementation: SwipeCarousel,
    },
    {
      id: 'variant',
      name: 'Optimized Implementation',
      trafficPercent: 50,
      implementation: OptimizedSwipeCarousel,
    },
  ],
  trafficAllocation: 10000, // 10k users
  startDate: new Date('2026-11-01'),
  endDate: new Date('2026-11-30'),
  goals: [
    { id: 'session-length', type: 'continuous', target: 300000 }, // 5 minutes
    { id: 'save-rate', type: 'conversion', target: 0.25 }, // 25% save rate
  ],
};
```

### 2. User Feedback Loop

#### Feedback Collection

```typescript
// User feedback collection system
interface UserFeedback {
  id: string;
  userId: string;
  feedbackType: 'bug' | 'feature' | 'improvement' | 'praise';
  category: string;
  message: string;
  rating: number;
  timestamp: Date;
  metadata: UserFeedbackMetadata;
}

interface UserFeedbackMetadata {
  page: string;
  component: string;
  action: string;
  errorDetails?: ErrorDetails;
}
```

### 3. User Journey Optimization

#### Journey Mapping and Analysis

```typescript
// User journey tracking
interface UserJourney {
  userId: string;
  sessions: UserSession[];
  goals: UserGoal[];
  painPoints: UserPainPoint[];
}

interface UserSession {
  id: string;
  startTime: Date;
  endTime: Date;
  actions: UserAction[];
  success: boolean;
}

interface UserAction {
  timestamp: Date;
  type: ActionType;
  component: string;
  outcome: ActionOutcome;
}
```

## Compliance and Regulations

### 1. GDPR Compliance

#### Data Protection

```bash
# 1. Data processing compliance
# Implement data protection measures:
# - Data encryption at rest and in transit
# - Access controls and logging
# - Data retention policies
# - User consent management

# 2. User rights implementation
# Configure GDPR user rights:
# - Right to access personal data
# - Right to data portability
# - Right to erasure
# - Right to object to processing
# - Right to withdraw consent
```

### 2. Security Compliance

#### Industry Standards

```bash
# 1. Security standards compliance
# Implement security controls:
# - ISO 27001
# - SOC 2 Type II
# - PCI DSS (if applicable)
# - HIPAA (if applicable)

# 2. Audit and compliance reporting
# Configure automated compliance reporting
# Implement regular security audits
# Maintain compliance documentation
```

## Team Operations

### 1. Development Operations

#### CI/CD Pipeline

```yaml
# .github/workflows/production-deploy.yml
name: Production Deployment

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm run test:unit

      - name: Run E2E tests
        run: pnpm run test:e2e

      - name: Check performance
        run: pnpm run build

      - name: Run security scan
        run: pnpm run security:scan

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Vercel
        uses: vercel/action@v1
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-team: ${{ secrets.VERCEL_TEAM }}
          vercel-project: trend-equity
          vercel-environment: production
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### 2. Operational Excellence

#### Site Reliability Engineering (SRE)

```bash
# 1. SLO (Service Level Objectives) monitoring
# Configure SLOs for:
# - Availability: 99.9%
# - Performance: < 1s page load
# - Error rate: < 0.1%

# 2. Error budget management
# Implement error budget policies
# Configure alerting based on error budget
# Plan for maintenance windows

# 3. Capacity planning
# Monitor resource utilization
# Predict growth requirements
# Plan capacity upgrades
```

## Conclusion

This deployment and operations guide provides comprehensive instructions for deploying, operating, and maintaining the production Trend-Equity platform with the new swipe-based discovery system. It covers:

1. **Production Deployment**: Environment setup, application deployment, and configuration
2. **Monitoring and Observability**: Real-time monitoring, performance tracking, and alerting
3. **Security Operations**: Security hardening, incident response, and compliance
4. **Maintenance Operations**: Daily, weekly, and monthly maintenance procedures
5. **Disaster Recovery**: Backup strategies and recovery procedures
6. **Performance Optimization**: Database, application, and code optimization
7. **Continuous Improvement**: A/B testing, user feedback loops, and journey optimization
8. **Compliance**: GDPR, security standards, and regulatory requirements
9. **Team Operations**: CI/CD pipelines, SRE practices, and operational excellence

The guide ensures the platform can be deployed reliably, monitored effectively, and maintained optimally throughout its lifecycle.

---

**Document Information**:

- **Created**: October 27, 2026
- **Version**: 1.0
- **Status**: Active Operations Guide
- **Next Review**: November 15, 2026

**Prepared By**: Operations and Infrastructure Team
**Approved By**: Executive Leadership Team

**Key Contacts**:

- Production Support: ops@trend-equity.com
- Security Team: security@trend-equity.com
- Performance Engineering: perf@trend-equity.com
- Platform Engineering: platform@trend-equity.com
