import React, { useState } from 'react';
import { Resource } from '../types';
import { Search, ExternalLink, FileText, Bookmark, Video } from 'lucide-react';

const RESOURCES: Resource[] = [
  {
    id: '1',
    title: 'ASH 2020 Guidelines for Acute Pain',
    description: 'The definitive clinical practice guidelines for management of acute complications of sickle cell disease by the American Society of Hematology.',
    category: 'Clinical',
    link: 'https://www.hematology.org/education/clinicians/guidelines-and-quality-care/clinical-practice-guidelines/sickle-cell-disease-guidelines',
    icon: 'doc'
  },
  {
    id: '2',
    title: 'Implicit Bias Test (Project Implicit)',
    description: 'Take the Harvard Implicit Association Test to recognize and mitigate cognitive shortcuts in triage and patient care.',
    category: 'Bias Training',
    link: 'https://implicit.harvard.edu/implicit/takeatest.html',
    icon: 'video'
  },
  {
    id: '3',
    title: 'CDC Sickle Cell Disease Data',
    description: 'Access the latest statistics, research, and impact data on Sickle Cell Disease from the Centers for Disease Control and Prevention.',
    category: 'Advocacy',
    link: 'https://www.cdc.gov/ncbddd/sicklecell/data.html',
    icon: 'doc'
  },
  {
    id: '4',
    title: 'SCDAA Educational Materials',
    description: 'Patient-centered resources and advocacy tools from the Sickle Cell Disease Association of America.',
    category: 'Patient Education',
    link: 'https://www.sicklecelldisease.org/education/',
    icon: 'video'
  },
  {
    id: '5',
    title: 'NIH SCD Management Guidelines',
    description: 'Evidence-based management of Sickle Cell Disease expert panel report from the National Institutes of Health.',
    category: 'Clinical',
    link: 'https://www.nhlbi.nih.gov/health-topics/evidence-based-management-sickle-cell-disease',
    icon: 'doc'
  }
];

const Resources: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<string>('All');

  const filteredResources = RESOURCES.filter(res => {
    const matchesSearch = res.title.toLowerCase().includes(searchTerm.toLowerCase()) || res.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'All' || res.category === filter;
    return matchesSearch && matchesFilter;
  });

  const categories = ['All', 'Clinical', 'Bias Training', 'Advocacy', 'Patient Education'];

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8 relative z-10">
      <div className="mb-10 glass-panel p-8 max-w-4xl">
        <h2 className="text-3xl font-extrabold text-slate-900 mb-4 drop-shadow-sm">Resource Library</h2>
        <p className="text-slate-700 max-w-3xl font-medium">
          Access guidelines, scripts, and educational materials to support your advocacy efforts. All resources are vetted by hematology specialists.
        </p>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-grow">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-500" />
          </div>
          <input
            type="text"
            className="block w-full pl-11 pr-4 py-3 glass-input rounded-xl leading-5 text-slate-800 placeholder-slate-500 font-medium"
            placeholder="Search guidelines, videos, scripts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-5 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all border ${
                filter === cat
                  ? 'bg-slate-800 text-white border-slate-700 shadow-md'
                  : 'glass-panel bg-white/40 text-slate-700 border-white/60 hover:bg-white/60 hover:shadow-sm'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredResources.map((resource) => (
          <div key={resource.id} className="glass-panel rounded-2xl border-white/60 bg-white/40 shadow-lg hover:shadow-xl hover:shadow-indigo-500/10 transition-all flex flex-col h-full group">
            <div className="p-6 flex-grow">
              <div className="flex justify-between items-start mb-5">
                <div className={`p-3 rounded-xl backdrop-blur-sm border shadow-sm group-hover:scale-110 transition-transform ${resource.icon === 'video' ? 'bg-purple-100/80 text-purple-600 border-purple-200/50' : 'bg-blue-100/80 text-blue-600 border-blue-200/50'}`}>
                  {resource.icon === 'video' ? <Video className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
                </div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-white/60 border border-white/80 text-slate-700 shadow-sm">
                  {resource.category}
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3 leading-tight group-hover:text-indigo-700 transition-colors">{resource.title}</h3>
              <p className="text-slate-700 text-sm leading-relaxed font-medium">{resource.description}</p>
            </div>
            <div className="bg-white/30 backdrop-blur-md px-6 py-4 border-t border-white/50 flex justify-between items-center rounded-b-2xl">
               <button className="text-slate-500 hover:text-red-500 transition-colors p-2 hover:bg-white/50 rounded-lg">
                  <Bookmark className="h-5 w-5" />
               </button>
               <a href={resource.link} target="_blank" rel="noreferrer" className="flex items-center text-sm font-bold text-red-600 hover:text-red-700 bg-red-50/50 px-4 py-2 rounded-lg border border-red-100/50 hover:bg-red-100/50 transition-colors">
                  Access Resource <ExternalLink className="ml-2 h-4 w-4" />
               </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Resources;