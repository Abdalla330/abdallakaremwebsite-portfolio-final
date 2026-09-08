# Abdullahi Mohamed Karim Hassan, IT Infrastructure Portfolio

Professional Node.js portfolio website focused on data center operations, server and database administration, Survey Solutions, regional infrastructure deployments, security and recovery, AWS cloud deployment, and data collection systems.

## Main sections

- Professional profile
- Work experience timeline
- Selected work and achievements
- Data center and field work photo gallery
- Technologies
- Contact form backed by PostgreSQL

## Local setup

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env`.
3. Fill in your database endpoint and credentials.
4. Run:

```bash
npm install
npm start
```

The site listens on port `8080` by default.

## EC2 deployment

After uploading this repository to GitHub:

```bash
cd ~
git clone https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
cd YOUR-REPOSITORY
npm install
```

Set your database environment variables, then start with PM2:

```bash
pm2 start index.js --name abdalla-website --update-env
pm2 save
```

When you update GitHub later:

```bash
cd ~/YOUR-REPOSITORY
git fetch origin
git reset --hard origin/main
npm install
pm2 restart abdalla-website --update-env
pm2 save
```

## Security

Do not commit `.env`, database passwords, AWS access keys, or other secrets to GitHub. On EC2, prefer an IAM role for AWS permissions.

## Photo policy for this portfolio
Personal photos used in the Survey Solutions, field rack installation, and Annual Economic Survey sections are the original supplied photos. They are referenced directly and are not AI-generated or altered likenesses.
