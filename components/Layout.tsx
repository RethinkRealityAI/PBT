import React, { ReactNode } from 'react';
import { AppView } from '../types';
import { Droplet, Activity, BookOpen, MessageSquare, Menu, X } from 'lucide-react';
import { motion } from 'motion/react';

interface LayoutProps {
  children: ReactNode;
  currentView: AppView;
  onChangeView: (view: AppView) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, currentView, onChangeView }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const navItems = [
    { view: AppView.HOME, label: 'Home', icon: Droplet },
    { view: AppView.SIMULATOR, label: 'Advocacy Sim', icon: MessageSquare },
    { view: AppView.DATA, label: 'Data & Impact', icon: Activity },
    { view: AppView.RESOURCES, label: 'Resources', icon: BookOpen },
  ];

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden text-slate-800">
      {/* Background decorative elements */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <motion.div 
          animate={{ x: [0, 50, 0], y: [0, 30, 0], scale: [1, 1.1, 1] }} 
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-red-400/20 blur-[100px] mix-blend-multiply"
        />
        <motion.div 
          animate={{ x: [0, -40, 0], y: [0, -50, 0], scale: [1, 1.2, 1] }} 
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-400/20 blur-[120px] mix-blend-multiply"
        />
        <motion.div 
          animate={{ x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.1, 1] }} 
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: -5 }}
          className="absolute top-[20%] right-[10%] w-[30%] h-[30%] rounded-full bg-rose-300/20 blur-[80px] mix-blend-multiply"
        />
      </div>

      {/* Special Simulator-only Header */}
      {currentView === AppView.SIMULATOR && (
         <div className="fixed top-4 left-4 z-50">
            <button 
              onClick={() => onChangeView(AppView.HOME)}
              className="flex items-center gap-2 bg-white/60 backdrop-blur-md border border-white/80 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.1)] px-4 py-2 rounded-full text-slate-700 font-bold hover:bg-white transition-all text-sm group"
            >
               <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 group-hover:-translate-x-0.5 transition-transform">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
               </span>
               Back
            </button>
         </div>
      )}

      {/* Navigation */}
      {currentView !== AppView.SIMULATOR && (
        <nav className="glass-panel sticky top-4 z-50 mx-4 sm:mx-6 lg:mx-8 mt-4 mb-2">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center cursor-pointer" onClick={() => onChangeView(AppView.HOME)}>
                <div className="bg-gradient-to-br from-red-500 to-rose-600 p-2 rounded-xl mr-3 shadow-lg shadow-red-500/30">
                  <Droplet className="h-6 w-6 text-white" fill="currentColor" />
                </div>
                <div>
                  <span className="font-bold text-xl text-slate-900 tracking-tight">AdvocateSCD</span>
                  <span className="hidden sm:inline-block ml-2 text-xs font-medium text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">BETA</span>
                </div>
              </div>

              {/* Desktop Nav */}
              <div className="hidden md:flex items-center space-x-2">
                {navItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => onChangeView(item.view)}
                    className={`flex items-center px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                      currentView === item.view
                        ? 'bg-white/70 text-slate-900 shadow-sm border border-white/80'
                        : 'text-slate-500 hover:bg-white/40 hover:text-slate-800'
                    }`}
                  >
                    <item.icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </button>
                ))}
                <button className="ml-4 bg-gradient-to-r from-slate-800 to-slate-900 text-white px-5 py-2 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-slate-900/20 transition-all border border-slate-700">
                  Provider Pledge
                </button>
              </div>

              {/* Mobile menu button */}
              <div className="flex items-center md:hidden">
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="text-slate-500 hover:text-slate-900 p-2 rounded-lg hover:bg-white/50 transition-colors"
                >
                  {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Nav */}
          {isMobileMenuOpen && (
            <div className="md:hidden absolute top-full left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-xl rounded-b-2xl mt-1 z-50">
              <div className="p-4 space-y-2">
                {navItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      onChangeView(item.view);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center w-full text-left px-4 py-3 rounded-xl text-base font-medium transition-all ${
                      currentView === item.view
                        ? 'bg-red-50 text-red-700 border border-red-100'
                        : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                    }`}
                  >
                    <item.icon className="h-5 w-5 mr-3" />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </nav>
      )}

      <main className="w-full z-10 block relative flex-grow flex flex-col min-h-[50vh] pb-12">
        {children}
      </main>

      {currentView !== AppView.SIMULATOR && (
        <footer className="glass-panel-dark mt-auto mx-4 sm:mx-6 lg:mx-8 mb-4 shrink-0">
          <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-bold mb-4 flex items-center text-white">
                <Droplet className="h-5 w-5 mr-2 text-red-400" fill="currentColor" /> AdvocateSCD
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Empowering healthcare professionals to dismantle bias and provide evidence-based, compassionate care for all individuals living with Sickle Cell Disease.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">Resources</h4>
              <ul className="space-y-2 text-slate-300 text-sm">
                <li><a href="https://www.hematology.org/education/clinicians/guidelines-and-quality-care/clinical-practice-guidelines/sickle-cell-disease-guidelines" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">ASH Guidelines</a></li>
                <li><a href="https://implicit.harvard.edu/implicit/takeatest.html" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Implicit Bias Training</a></li>
                <li><a href="https://www.cdc.gov/ncbddd/sicklecell/data.html" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">CDC SCD Data</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">Connect</h4>
              <p className="text-slate-300 text-sm mb-4">Join our community of advocates.</p>
              <div className="flex space-x-2">
                <input type="email" placeholder="Enter your email" className="bg-slate-800/50 border border-slate-700 text-white px-4 py-2 rounded-xl text-sm w-full focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-all" />
                <button className="bg-gradient-to-r from-red-500 to-rose-600 px-5 py-2 rounded-xl text-sm font-medium text-white hover:shadow-lg hover:shadow-red-500/20 transition-all border border-red-400/50">Join</button>
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};

export default Layout;