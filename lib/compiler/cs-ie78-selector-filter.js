var parseSelectors = require('./selector-parser').parseSelectors

var encodeSelector =  require('./cs-util').encodeSelector;
var decodeSelector = require('./cs-util').decodeSelector;
var normalizeNth = require('./cs-util').normalizeNth;
var walkSelector = require('./cs-util').walkSelector;
var walkNode = require('./cs-util').walkNode;
var CSSManager = require('./cs-util').CSSManager;
function ie7SelectorFilter(resource,cssom,rule,index){
	var css = new CSSManager(resource,cssom,index)
	doSelectorFilter(resource,cssom,rule,index,normalizeIE7Selector)
}
function ie8SelectorFilter(resource,cssom,rule,index){
	doSelectorFilter(resource,cssom,rule,index,normalizeIE8Selector)
}

function doSelectorFilter(resource,cssom,rule,index,normalizer){
	var css = new CSSManager(resource,cssom,index)
	var selectorData = parseSelectors(rule.selectorText);
	walkSelector(selectorData,normalizer);
	var result = [];
	var groupResult = [];
	var dynamicSelectors = [];
	var attributeSelectors = [];
	var attributeClasses = [];
	var nthSelectors = [];
	var nthClasses = [];
	var notSelectors = [];
	var notClasses = [];
	var notPrefix = [];
	walkNode(selectorData,function(group,node,index){
		var pureSelector;
		for(var i=0;i<node.length;i++){
			var c = node[i];
			if(c.charAt(0) == '.'){
			switch(c){
				case '.active__':
				case '.focus__': 
					pureSelector =  pureSelector || toPureSelector(groupResult,node);
					dynamicSelectors .push(pureSelector)
					break;
				default:
					var c2 = c.replace(/^\.(?:nth|attr|ref-not)-(.*)__$/,'$1')
					if(c2 != c){
						if(/\.attr-.+__/.test(c)){
							pureSelector =  pureSelector || toPureSelector(groupResult,node);
							attributeSelectors.push(pureSelector);
							attributeClasses && attributeClasses.push(c2);
						}else if(/\.nth-.+__/.test(c)){
							pureSelector =  pureSelector || toPureSelector(groupResult,node);
							nthSelectors.push(pureSelector)
							nthClasses.push(c2);
						}else if(/\.ref-not-.+__/.test(c)){
							pureSelector =  pureSelector || toPureSelector(groupResult,node);
							notSelectors.push(pureSelector);
							notPrefix.push(groupResult.join(''))
							notClasses && notClasses.push('not-'+c2);
						}
					}
				}
				
			}
		}
		
		groupResult.push(node.join(''))
		if(index==group.length-1){
			result.push(groupResult.join(''))
			groupResult = [];
		}
	})
	rule.selectorText = result.reverse().join(',');
	css.setup('dc',dynamicSelectors);
	css.setup('attr',attributeSelectors).config('attr-classes',attributeClasses);
	css.setup('update',nthSelectors,'cs-update-nth:1;').config('nth-classes',nthClasses);
	var i=notSelectors.length;
	while(i--){
		var nc = notClasses[i]
		var setupSelector = notSelectors[i];
		var target = decodeSelector(nc.slice(4))
		css.setup('update',[setupSelector],'cs-ref-'+nc+':1;cs-ref:1;')
			.config('ref-classes',[nc])
			.append(compileSelect(setupSelector,target),'cs-target-'+nc+':1;');
		var genRule = cssom.cssRules[index+1];
		doSelectorFilter(resource,cssom,genRule,index+1,normalizer)
	}
}
function compileSelect(selector,nc){
	return selector.replace(/[^\s>]*$/,function(a){
		if(/^\w/.test(a) && /^\w/.test(nc)){//tag select
			if(a.toLowerCase().indexOf(nc.toLowerCase()) == 0){
				return a;
			}else{//failed anyway
				return '_'+a;
			}
		}else{
			//ie678 顺序无所谓
			if(/^\w/.test(nc)){
				return nc + a;
			}else{
				return a + nc;
			}
		}
	})
}
function toPureSelector(groupResult,node){
	var buf = groupResult.concat();
	for(var i=0;i<node.length;i++){
		if(!/^\.\w+.*__$/.test(node[i])){
			buf.push(node[i]);
		}
	}
	return buf.join('');
}
function normalizeIE7Selector(node,item,i){
	if(item.charAt() == ':'){
		item = item.substr(1);
		switch(item){
		//case 'hover':
		case 'active':
		case 'focus':
			node[i] = '.'+item+'__'
			break;
		default:
			normalizeIE8Pseudo(node,item,i);
		}
	}
}
function normalizeIE8Selector(node,item,i){
	if(item.charAt() == ':'){
		item = item.substr(1);
		normalizeIE8Pseudo(node,item,i);
	}
}
function normalizeIE8Pseudo(node,item,i){
	switch(item){
	case 'default':
	case 'valid':
	case 'invalid':
	case 'in-range':
	case 'out-of-range':
		break;
	//form status support
	case 'required':
		var newItem = 'required';
	case 'optional':
		newItem = newItem || 'required=null';
	case 'read-only':
		newItem = newItem || 'readOnly=true';
	case 'read-write':
		newItem = newItem || 'readOnly=false';
	////replace :checked,:enabled,:disabled
	case 'checked':
		newItem = newItem || 'checked=true';
	case 'enabled':
		newItem = newItem || 'disabled=false';
	case 'disabled':
		newItem = newItem || 'disabled=true';
		item = encodeSelector(newItem);
		node[i] = '.attr-'+item+'__'
		break;
	case 'first-letter'://||link|
	case 'first-line':
	case 'link':
	case 'visited':
		break;
	case 'target':
		node[i] = '.target__';
		break;
	case 'empty':
		//TODO:...
		node[i] = '.ref-empty__';
		break;
	case 'only-child':
	case 'only-of-type':
		var first = item.replace('only','')+'_0_0'
		var last = item.replace('only','last')+'_0_0'
		node.splice(i+1,0,'.nth-'+last+'__')
		newItem = first;
	//case 'first-child': //only for ie6
	//	newItem = newItem || 'nth-child_0_0'
	case 'last-child':
		item = newItem || 'nth-last-child_0_0'
	default:
		if(/^nth-/.test(item)){//nth
			//nth-child,nth-last-child,nth-of-type,nth-last-of-type
			item = item.replace(/\(.*\)/,normalizeNth)
			node[i] = '.'+item+'__';
		}else if(/^not\(/.test(item)){
			item = item.slice(4,-1);
			var encoded = encodeSelector(item);
			node[i] = '.ref-not-'+encoded+'__'
		}
	}
}
exports.normalizeIE8Pseudo = normalizeIE8Pseudo;
exports.ie7SelectorFilter = ie7SelectorFilter;
exports.ie8SelectorFilter = ie8SelectorFilter;